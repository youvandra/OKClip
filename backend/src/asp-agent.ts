#!/usr/bin/env node
/**
 * OKClip ASP worker — the live A2A agent.
 *
 * OKX A2A has no HTTP endpoint: a client agent publishes a task designating
 * OKClip, which moves through an on-chain state machine. This worker polls that
 * state deterministically (no LLM needed) and drives the provider side:
 *
 *   status 0 (created)  -> apply   (accept the job at a negotiated price)
 *   status 1 (accepted) -> run the clip engine, then deliver over XMTP
 *
 * Requires: onchainos CLI on PATH + a logged-in wallet + the A2A gateway
 * reachable (okx-a2a doctor green), plus the clip pipeline's runtime deps
 * (yt-dlp, ffmpeg, Deepgram/Sumopod keys).
 */
import { join } from "node:path";
import { buildDeliverySummary, parseJobToBrief } from "./a2a-adapter.js";
import { config } from "./config.js";
import { buildDelivery } from "./delivery.js";
import { run } from "./exec.js";
import { logger } from "./logger.js";
import { stitch } from "./stitch.js";
import { runJob } from "./worker.js";
import type { Brief } from "./types.js";

const AGENT_ID = process.env.OKCLIP_AGENT_ID ?? "5189";
const ONCHAINOS = process.env.ONCHAINOS_BIN ?? "onchainos";
const POLL_MS = Number(process.env.ASP_POLL_MS ?? 15_000);
const TOKEN_SYMBOL = process.env.ASP_TOKEN_SYMBOL ?? "USDT";
// Safety gate: when set, only act on tasks from this client agent. Keeps the
// worker from applying to real clients before deliver is proven end-to-end.
const ALLOWED_CLIENT = process.env.ASP_ALLOWED_CLIENT ?? "";

type Phase = "applied" | "delivered" | "declined";
const phases = new Map<string, Phase>();
/** Clips already produced for a job, so deliver retries don't re-run the engine. */
const produced = new Map<string, { file: string; text: string }>();

/** Does an error indicate the action already happened (idempotent no-op)? */
function alreadyDone(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return m.includes("already") || m.includes("duplicate") || m.includes("exists");
}

/** Run an onchainos command and parse its JSON stdout. */
async function oc(args: string[]): Promise<any> {
  const res = await run(ONCHAINOS, args, { timeoutMs: 120_000 });
  if (res.code !== 0) {
    throw new Error(res.stderr.trim() || `onchainos ${args.join(" ")} failed`);
  }
  try {
    return JSON.parse(res.stdout.trim() || "{}");
  } catch {
    return {};
  }
}

/** Is OKClip the provider on this task? active-tasks annotates our own rows. */
function isOurs(t: any): boolean {
  if (String(t.myAgentId ?? "") === AGENT_ID && t.myRole === "asp") return true;
  const provider = String(
    t.providerAgentId ?? t.provider ?? t.aspAgentId ?? t.agentId ?? "",
  );
  return provider === AGENT_ID;
}

/** The client agent on the other side of the task. */
function clientOf(t: any): string {
  return String(t.counterpartyAgentId ?? t.userAgentId ?? "");
}

function jobIdOf(t: any): string {
  return String(t.jobId ?? t.id ?? t.taskId ?? "");
}

/** Numeric task status (active-tasks: statusCode is the number; status is text). */
function statusOf(t: any): number {
  return Number(t.statusCode ?? t.status);
}

/** Build a Brief from the task's serviceParams / description. */
function briefFromTask(t: any): Brief {
  let params: Record<string, unknown> = {};
  const raw = t.serviceParams ?? t.serviceBody ?? t.params;
  if (typeof raw === "string") {
    try {
      params = JSON.parse(raw);
    } catch {
      /* ignore */
    }
  } else if (raw && typeof raw === "object") {
    params = raw as Record<string, unknown>;
  }
  return parseJobToBrief({
    description: String(t.description ?? t.title ?? ""),
    serviceParams: params,
  });
}

/**
 * Accept a newly-created job at a negotiated price. On a transient error the
 * phase is left unset so the next poll retries; a genuine "already applied"
 * is treated as success.
 */
async function handleApply(jobId: string, t: any): Promise<void> {
  // active-tasks does not carry serviceParams, so we accept the client's
  // offered budget rather than re-negotiating by video length here.
  const price = String(t.tokenAmount ?? "0.5");
  const symbol = String(t.tokenSymbol ?? TOKEN_SYMBOL);
  try {
    await oc([
      "agent", "apply",
      "--agent-id", AGENT_ID,
      "--token-amount", price,
      "--token-symbol", symbol,
      jobId,
    ]);
  } catch (err) {
    if (alreadyDone(err)) {
      phases.set(jobId, "applied");
      return;
    }
    throw err; // transient — leave unset so the next poll retries
  }
  phases.set(jobId, "applied");
  logger.info({ jobId, price, symbol }, "Applied to task");
}

/**
 * Produce clips for an accepted job (once, cached) and deliver them. Multiple
 * clips are stitched into a single reel since `deliver` attaches one file.
 * Deliver retries reuse the cached output instead of re-running the engine.
 */
async function handleDeliver(jobId: string, t: any): Promise<void> {
  let out = produced.get(jobId);
  if (!out) {
    let brief: Brief;
    try {
      brief = briefFromTask(t);
    } catch (err) {
      logger.error(
        { jobId, err },
        "Cannot build brief (no serviceParams/url in task); declining",
      );
      phases.set(jobId, "declined");
      return;
    }
    const job = await runJob(AGENT_ID, brief, {
      clipCount: brief.clipCount,
      aspectRatio: brief.aspectRatio ?? "9:16",
      maxClipSeconds: brief.maxClipSeconds ?? 60,
      priceUsdt: "0",
      revisionRounds: 1,
    });
    if (job.status === "failed" || !job.output?.length) {
      logger.error({ jobId, error: job.error }, "Clip job failed");
      phases.set(jobId, "declined");
      return;
    }
    const workDir = join(config.STORAGE_DIR, job.id);
    const files = job.output.map((c) =>
      join(workDir, c.downloadUrl.split("/").pop()!),
    );
    let file = files[0]!;
    if (files.length > 1) {
      try {
        file = await stitch(files, workDir, join(workDir, "reel.mp4"));
      } catch (err) {
        logger.warn({ jobId, err }, "Stitch failed; delivering first clip");
      }
    }
    out = { file, text: buildDeliverySummary(buildDelivery(job)) };
    produced.set(jobId, out);
  }
  try {
    await oc([
      "agent", "deliver",
      "--agent-id", AGENT_ID,
      "--deliverable-text", out.text,
      "--file", out.file,
      jobId,
    ]);
  } catch (err) {
    if (alreadyDone(err)) {
      phases.set(jobId, "delivered");
      return;
    }
    throw err; // transient — retry deliver next poll (engine output cached)
  }
  phases.set(jobId, "delivered");
  logger.info({ jobId }, "Delivered");
}

async function pollOnce(): Promise<void> {
  const out = await oc(["agent", "active-tasks"]);
  const tasks: any[] = out?.data?.tasks ?? [];
  for (const t of tasks) {
    const jobId = jobIdOf(t);
    if (!jobId || !isOurs(t)) continue;
    if (ALLOWED_CLIENT && clientOf(t) !== ALLOWED_CLIENT) continue;
    const status = statusOf(t);
    const phase = phases.get(jobId);
    try {
      if (status === 0 && phase !== "applied" && phase !== "declined") {
        await handleApply(jobId, t);
      } else if (status === 1 && phase !== "delivered" && phase !== "declined") {
        await handleDeliver(jobId, t);
      }
    } catch (err) {
      logger.error({ jobId, err }, "Task handling failed");
    }
  }
}

async function main(): Promise<void> {
  logger.info({ AGENT_ID, POLL_MS }, "OKClip ASP worker started");
  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      logger.error({ err }, "Poll failed");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

main().catch((err) => {
  logger.error({ err }, "ASP worker crashed");
  process.exit(1);
});
