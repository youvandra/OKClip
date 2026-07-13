import { Router } from "express";
import { z } from "zod";
import { config } from "./config.js";
import { buildDelivery, canRevise } from "./delivery.js";
import { probe } from "./downloader.js";
import { applyPreferences, getPreferences } from "./memory.js";
import { negotiate } from "./negotiation.js";
import { reviseClips } from "./pipeline.js";
import type { JobQueue } from "./queue.js";
import type { NegotiatedTerms } from "./types.js";

const briefSchema = z.object({
  url: z.string().url(),
  prompt: z.string().min(1),
  clipCount: z.number().int().min(1).max(5),
  aspectRatio: z.enum(["16:9", "9:16", "1:1"]).optional(),
  maxClipSeconds: z.number().int().positive().optional(),
  minClipSeconds: z.number().int().positive().optional(),
  language: z.string().optional(),
  subtitleStyle: z.enum(["default", "bold", "karaoke", "minimal"]).optional(),
  resolution: z.union([z.literal(360), z.literal(480), z.literal(720), z.literal(1080)]).optional(),
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

/**
 * Cheap per-IP limiter for the expensive job endpoint — a public demo surface
 * that would otherwise let anyone burn ASR credits. Sliding one-hour window.
 */
const JOBS_PER_HOUR = Number(process.env.JOBS_PER_HOUR ?? 5);
const jobHits = new Map<string, number[]>();
function jobRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 60 * 1000;
  const hits = (jobHits.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= JOBS_PER_HOUR) {
    jobHits.set(ip, hits);
    return true;
  }
  hits.push(now);
  jobHits.set(ip, hits);
  return false;
}

/**
 * The internal clip-work API — the engine, not the payment protocol. Used by
 * the frontend demo and by the onchainos ASP agent (which owns the OKX A2A
 * escrow/state machine and calls this to do the actual clipping).
 */
export function createJobsRouter(queue: JobQueue): Router {
  const router = Router();

  // Price a brief: probe the source (best-effort) + fold in style memory.
  router.post("/negotiate", async (req, res) => {
    const parsed = z
      .object({ agentId: z.string().min(1), brief: briefSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.flatten() });
    }
    const prefs = await getPreferences(parsed.data.agentId);
    const brief = applyPreferences(parsed.data.brief, prefs);

    let meta;
    try {
      meta = await probe(brief.url);
    } catch {
      // Pricing falls back to base when the probe can't run.
    }
    const result = negotiate(brief, meta, config.MAX_SOURCE_SECONDS);
    return res.json({ ...result, appliedPreferences: prefs ?? null });
  });

  // Start a clip job.
  router.post("/jobs", (req, res) => {
    if (jobRateLimited(req.ip ?? "unknown")) {
      return res
        .status(429)
        .json({ error: `rate limit: max ${JOBS_PER_HOUR} jobs/hour` });
    }
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
    const job = queue.enqueue(
      parsed.data.agentId,
      parsed.data.brief,
      parsed.data.terms as NegotiatedTerms,
    );
    return res.status(201).json({ jobId: job.id, status: job.status });
  });

  // Poll a job's delivery.
  router.get("/jobs/:id", (req, res) => {
    const job = queue.get(req.params.id);
    if (!job) return res.status(404).json({ error: "job not found" });
    return res.json(buildDelivery(job));
  });

  // Request a revision (async): re-clip rejected moments.
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
