import { nanoid } from "nanoid";
import { runPipeline } from "./pipeline.js";
import type { Brief, ClipJob, NegotiatedTerms } from "./types.js";

/**
 * Run one clip job to completion headlessly (no HTTP, no queue) and return the
 * finished job. This is the work-engine entry the onchainos ASP agent calls
 * once an A2A job is accepted and escrow is funded.
 */
export async function runJob(
  agentId: string,
  brief: Brief,
  terms: NegotiatedTerms,
): Promise<ClipJob> {
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

  await runPipeline(job, {
    setStatus: (status, patch) => {
      job.status = status;
      if (patch) Object.assign(job, patch);
      job.updatedAt = Date.now();
    },
  });

  return job;
}
