#!/usr/bin/env node
/**
 * OKClip ASP worker — the live A2A agent.
 *
 * OKX A2A has no HTTP endpoint: a client agent publishes a task designating
 * OKClip, which moves through an on-chain state machine. This worker polls that
 * state deterministically (no LLM) and drives the provider side:
 *
 *   0 created   -> apply   (accept the job at the offered budget)
 *   1 accepted  -> run the clip engine, then deliver (in the background)
 *   2 submitted -> delivered; waiting on the client
 *   3 refused   -> stop
 *   4 disputed  -> stop; needs manual/evidence handling
 *   >=5         -> terminal; clean up
 *
 * Requires: onchainos CLI on PATH + a logged-in wallet + a reachable A2A
 * gateway (okx-a2a doctor green), plus the pipeline deps (yt-dlp, ffmpeg,
 * Deepgram/Sumopod keys).
 */
import { createServer } from "node:http";
import { argv } from "node:process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { buildDeliverySummary } from "./a2a-adapter.js";
import {
  alreadyDone,
  briefFromTask,
  clientOf,
  isOurs,
  isTerminalStatus,
  jobIdOf,
  STATUS,
  statusOf,
} from "./asp-parse.js";
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
// Safety gate: when set, only act on tasks from this client agent.
const ALLOWED_CLIENT = process.env.ASP_ALLOWED_CLIENT ?? "";
// The engine is CPU-heavy, so bound concurrent deliveries.
const MAX_CONCURRENT = Number(process.env.ASP_MAX_CONCURRENT ?? 1);
const MAX_APPLY_TRIES = 3;

type Phase = "applied" | "delivered" | "declined" | "disputed";
const phases = new Map<string, Phase>();
/** Clips already produced, so deliver retries don't re-run the engine. */
const produced = new Map<string, { file: string; text: string }>();
const applyTries = new Map<string, number>();
/** Jobs whose deliver is running in the background right now. */
const inFlight = new Set<string>();

/**
 * Run an onchainos command. The CLI signals failures as `{ ok:false, error }`
 * in stdout (often with exit 0), so surface the real error.
 */
async function oc(args: string[]): Promise<any> {
  const res = await run(ONCHAINOS, args, { timeoutMs: 120_000 });
  const body = res.stdout.trim();
  let json: any;
  try {
    json = JSON.parse(body);
  } catch {
    /* non-JSON */
  }
  if (res.code !== 0 || (json && json.ok === false)) {
    throw new Error(
      (json && json.error) ||
        res.stderr.trim() ||
        body ||
        `onchainos ${args.join(" ")} failed`,
    );
  }
  return json ?? {};
}

/** Accept a created job at the offered budget. */
async function handleApply(jobId: string, t: any): Promise<void> {
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
    const tries = (applyTries.get(jobId) ?? 0) + 1;
    applyTries.set(jobId, tries);
    if (tries >= MAX_APPLY_TRIES) {
      logger.error({ jobId, tries, err }, "Apply keeps failing; giving up");
      phases.set(jobId, "declined");
      return;
    }
    throw err; // retry a couple times, then stop
  }
  phases.set(jobId, "applied");
  totalApplied++;
  logger.info({ jobId, price, symbol }, "Applied to task");
}

/**
 * Produce clips (once, cached) and deliver them. Multiple clips are stitched
 * into one reel since `deliver` takes a single file. Runs in the background so
 * the poll loop keeps applying to other jobs.
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
    throw err; // transient — retry next poll (engine output cached)
  }
  phases.set(jobId, "delivered");
  totalDelivered++;
  logger.info({ jobId }, "Delivered");
}

let lastPollAt = 0;
let lastPollOk = false;
let lastPollError = "";
let totalApplied = 0;
let totalDelivered = 0;

async function pollOnce(): Promise<void> {
  const out = await oc(["agent", "active-tasks"]);
  lastPollAt = Date.now();
  lastPollOk = true;
  lastPollError = "";
  const tasks: any[] = out?.data?.tasks ?? [];
  logger.debug({ taskCount: tasks.length }, "Polled active tasks");
  for (const t of tasks) {
    const jobId = jobIdOf(t);
    if (!jobId) {
      logger.debug({ raw: t }, "Task missing jobId — skipping");
      continue;
    }
    if (!isOurs(t, AGENT_ID)) {
      logger.debug({ jobId, raw: t }, "Task not ours — skipping");
      continue;
    }
    if (ALLOWED_CLIENT && clientOf(t) !== ALLOWED_CLIENT) {
      logger.warn(
        { jobId, client: clientOf(t), gate: ALLOWED_CLIENT },
        "Task gated by ALLOWED_CLIENT — skipping",
      );
      continue;
    }

    const phase = phases.get(jobId);
    if (phase === "delivered" || phase === "declined" || phase === "disputed") {
      continue;
    }
    const status = statusOf(t);

    // Applied but on-chain not yet confirmed — don't re-apply.
    if (phase === "applied" && status === STATUS.created) {
      continue;
    }

    if (status === STATUS.created) {
      try {
        await handleApply(jobId, t);
      } catch (err) {
        logger.error({ jobId, err }, "Apply failed");
      }
    } else if (status === STATUS.accepted) {
      if (!inFlight.has(jobId) && inFlight.size < MAX_CONCURRENT) {
        inFlight.add(jobId);
        void handleDeliver(jobId, t)
          .catch((err) => logger.error({ jobId, err }, "Deliver failed"))
          .finally(() => inFlight.delete(jobId));
      }
    } else if (status === STATUS.submitted) {
      phases.set(jobId, "delivered"); // already delivered; awaiting client
    } else if (status === STATUS.refused) {
      logger.warn({ jobId }, "Task refused by client");
      phases.set(jobId, "declined");
    } else if (status === STATUS.disputed) {
      logger.warn({ jobId }, "Task disputed — needs manual/evidence handling");
      phases.set(jobId, "disputed");
    } else if (isTerminalStatus(status)) {
      phases.set(jobId, "delivered");
      produced.delete(jobId);
    }
  }
}

async function main(): Promise<void> {
  const startTime = Date.now();

  logger.info(
    { AGENT_ID, POLL_MS, MAX_CONCURRENT, gated: ALLOWED_CLIENT || "off" },
    "OKClip ASP worker started",
  );

  const healthPort = Number(process.env.ASP_HEALTH_PORT ?? 0);
  if (healthPort > 0) {
    createServer((_req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          status: lastPollOk ? "ok" : "error",
          agentId: AGENT_ID,
          gated: ALLOWED_CLIENT || null,
          lastPollAt: lastPollAt ? new Date(lastPollAt).toISOString() : null,
          lastPollError: lastPollError || null,
          stats: { totalApplied, totalDelivered, inFlight: inFlight.size, phases: Object.fromEntries(phases) },
          uptimeMs: Date.now() - startTime,
        }),
      );
    })
      .on("error", (err) => {
        logger.warn({ healthPort, err: err.message }, "Health endpoint failed to bind");
      })
      .listen(healthPort, "127.0.0.1", () => {
        logger.info({ healthPort }, "ASP health endpoint listening");
      });
  }

  for (;;) {
    try {
      await pollOnce();
    } catch (err) {
      lastPollOk = false;
      lastPollError = err instanceof Error ? err.message : String(err);
      logger.error({ err }, "Poll failed");
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

// Only start the loop when run directly, not when imported by tests.
if (import.meta.url === pathToFileURL(argv[1] ?? "").href) {
  main().catch((err) => {
    logger.error({ err }, "ASP worker crashed");
    process.exit(1);
  });
}
