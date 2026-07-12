import { nanoid } from "nanoid";
import { logger } from "./logger.js";
import type { Brief, ClipJob, JobStatus, NegotiatedTerms } from "./types.js";

/** A processor turns a queued job into its finished (or failed) state. */
export type JobProcessor = (job: ClipJob) => Promise<void>;

/**
 * In-memory, single-worker job queue (MVP).
 *
 * Video work is I/O-bound and serialized to avoid saturating bandwidth, so one
 * worker drains the queue sequentially. The public surface is small enough to
 * swap for BullMQ/Redis later without touching callers.
 */
export class JobQueue {
  private readonly jobs = new Map<string, ClipJob>();
  private readonly waiting: string[] = [];
  private running = false;

  constructor(private readonly processor: JobProcessor) {}

  /** Register a job and schedule it. Returns the created job. */
  enqueue(agentId: string, brief: Brief, terms: NegotiatedTerms): ClipJob {
    const now = Date.now();
    const job: ClipJob = {
      id: nanoid(12),
      agentId,
      status: "queued",
      brief,
      terms,
      revisionsUsed: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    this.waiting.push(job.id);
    logger.info({ jobId: job.id, agentId }, "Job enqueued");
    void this.drain();
    return job;
  }

  get(id: string): ClipJob | undefined {
    return this.jobs.get(id);
  }

  /** Mutate a job's status (used by processors to report progress). */
  setStatus(id: string, status: JobStatus, patch?: Partial<ClipJob>): void {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = status;
    job.updatedAt = Date.now();
    if (patch) Object.assign(job, patch);
  }

  get size(): number {
    return this.waiting.length;
  }

  /** Drain the queue one job at a time. Safe to call repeatedly. */
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.waiting.length > 0) {
        const id = this.waiting.shift()!;
        const job = this.jobs.get(id);
        if (!job) continue;
        try {
          await this.processor(job);
        } catch (err) {
          job.status = "failed";
          job.error = err instanceof Error ? err.message : String(err);
          job.updatedAt = Date.now();
          logger.error({ jobId: id, err }, "Job failed");
        }
      }
    } finally {
      this.running = false;
    }
  }
}
