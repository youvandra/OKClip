import { Router } from "express";
import { z } from "zod";
import { buildDelivery, canRevise } from "./delivery.js";
import { probe } from "./downloader.js";
import type { EscrowProvider } from "./escrow.js";
import { logger } from "./logger.js";
import { applyPreferences, getPreferences, recordJob } from "./memory.js";
import { negotiate } from "./negotiation.js";
import { reviseClips } from "./pipeline.js";
import type { JobQueue } from "./queue.js";
import { config } from "./config.js";
import type { NegotiatedTerms } from "./types.js";

const briefSchema = z.object({
  url: z.string().url(),
  prompt: z.string().min(1),
  clipCount: z.number().int().min(1).max(5),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  maxClipSeconds: z.number().int().positive().optional(),
  language: z.string().optional(),
});

const termsSchema = z.object({
  clipCount: z.number().int().min(1).max(5),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]),
  maxClipSeconds: z.number().int().positive(),
  priceUsdt: z.string(),
  revisionRounds: z.number().int().min(0),
});

const rejectionSchema = z.object({
  clipIndex: z.number().int().min(0),
  feedback: z.string().min(1),
});

export interface A2ADeps {
  queue: JobQueue;
  escrow: EscrowProvider;
}

/**
 * The A2A surface: negotiate -> fund escrow + start job -> poll delivery ->
 * approve (release escrow) or revise. Escrow settlement is delegated to the
 * injected provider (OKX in production).
 */
export function createA2ARouter({ queue, escrow }: A2ADeps): Router {
  const router = Router();

  // Negotiate terms for a brief. Probes the source (best-effort) for pricing
  // and folds in the agent's style memory.
  router.post("/negotiate", async (req, res) => {
    const parsed = z
      .object({ agentId: z.string().min(1), brief: briefSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { agentId } = parsed.data;
    const prefs = await getPreferences(agentId);
    const brief = applyPreferences(parsed.data.brief, prefs);

    let meta;
    try {
      meta = await probe(brief.url);
    } catch (err) {
      logger.warn({ err }, "Probe failed during negotiation; pricing on base");
    }

    const result = negotiate(brief, meta, config.MAX_SOURCE_SECONDS);
    return res.json({ ...result, appliedPreferences: prefs ?? null });
  });

  // Accept terms: fund escrow, enqueue the job.
  router.post("/jobs", async (req, res) => {
    const parsed = z
      .object({
        agentId: z.string().min(1),
        brief: briefSchema,
        terms: termsSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { agentId, brief } = parsed.data;
    const terms = parsed.data.terms as NegotiatedTerms;

    const job = queue.enqueue(agentId, brief, terms);
    await escrow.fund(job.id, agentId, terms.priceUsdt);
    return res.status(201).json({ jobId: job.id, status: job.status });
  });

  // Poll a job's delivery.
  router.get("/jobs/:id", (req, res) => {
    const job = queue.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });
    return res.json(buildDelivery(job));
  });

  // Approve delivery: release escrow, record style memory.
  router.post("/jobs/:id/approve", async (req, res) => {
    const job = queue.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });
    if (job.status !== "done") {
      return res.status(409).json({ error: `job is ${job.status}, not done` });
    }
    if (job.approved) return res.json(buildDelivery(job));

    await escrow.release(job.id);
    queue.setStatus(job.id, "done", { approved: true });
    await recordJob(job.agentId, job.terms, job.brief);
    return res.json(buildDelivery(queue.get(job.id)!));
  });

  // Request a revision: re-clip rejected moments (async), poll for the result.
  router.post("/jobs/:id/revise", (req, res) => {
    const job = queue.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });

    const parsed = z
      .object({ rejections: z.array(rejectionSchema).min(1) })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    if (!canRevise(job)) {
      return res
        .status(409)
        .json({ error: "no revision rounds left or job not revisable" });
    }

    void reviseClips(job, parsed.data.rejections, {
      setStatus: (status, patch) => queue.setStatus(job.id, status, patch),
    }).catch((err) => {
      queue.setStatus(job.id, "failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    });

    return res.status(202).json({ jobId: job.id, status: "revising" });
  });

  return router;
}
