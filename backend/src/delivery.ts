import type { ClipJob, Delivery } from "./types.js";

/** Build the delivery envelope handed back to the requesting agent. */
export function buildDelivery(job: ClipJob): Delivery {
  const clips = job.output ?? [];
  const roundsLeft = job.terms.revisionRounds - job.revisionsUsed;
  const message =
    job.status === "done"
      ? `${clips.length} clip(s) ready. Each carries a viral score, the reasons it was picked, and an evidence block. Reject a clip with feedback to revise (${roundsLeft} revision round(s) left).`
      : job.status === "failed"
        ? `Job failed: ${job.error ?? "unknown error"}`
        : `Job ${job.status}...`;

  return {
    jobId: job.id,
    status: job.status,
    clips,
    runnerUps: job.runnerUps ?? [],
    message,
    estimatedSec: job.startedAt
      ? Math.round((Date.now() - job.startedAt) / 1000)
      : undefined,
  };
}

/** Whether a job can still take a revision round. */
export function canRevise(job: ClipJob): boolean {
  return (
    job.revisionsUsed < job.terms.revisionRounds &&
    job.status === "done"
  );
}
