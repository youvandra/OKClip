import type { ClipJob, Delivery } from "./types.js";

/** Build the delivery envelope handed back to the requesting agent. */
export function buildDelivery(job: ClipJob): Delivery {
  const clips = job.output ?? [];
  const message =
    job.status === "done" || job.status === "delivering"
      ? `${clips.length} clip(s) ready. Each carries a viral score, the reasons it was picked, and an evidence block. Approve to release escrow, or reject a clip with feedback to revise (${job.terms.revisionRounds - job.revisionsUsed} revision round(s) left).`
      : job.status === "failed"
        ? `Job failed: ${job.error ?? "unknown error"}`
        : `Job ${job.status}...`;

  return {
    jobId: job.id,
    status: job.status,
    clips,
    runnerUps: job.runnerUps ?? [],
    message,
    approved: Boolean(job.approved),
  };
}

/** Whether a job can still take a revision round. */
export function canRevise(job: ClipJob): boolean {
  return (
    !job.approved &&
    job.revisionsUsed < job.terms.revisionRounds &&
    (job.status === "done" || job.status === "delivering")
  );
}
