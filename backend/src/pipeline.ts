import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { analyze, segmentTranscript } from "./analyzer.js";
import { clip } from "./clipper.js";
import { config } from "./config.js";
import { download } from "./downloader.js";
import { logger } from "./logger.js";
import { transcribe } from "./transcriber.js";
import type {
  ClipEvidence,
  ClipJob,
  ClipRejection,
  ClipResult,
  JobStatus,
  SelectedMoment,
  Transcript,
} from "./types.js";

export interface PipelineHooks {
  setStatus(status: JobStatus, patch?: Partial<ClipJob>): void;
}

/** Honesty block attached to every clip (see PLAN honesty rules). */
export function buildEvidence(transcript: Transcript): ClipEvidence {
  return {
    sourceDurationSec: transcript.durationSec,
    analyzedSegments: segmentTranscript(transcript).length,
    asr: "deepgram-nova-2",
    caveat:
      "Moment ranking is heuristic over the transcript, not a guarantee of virality.",
  };
}

/** Assemble a decision-grade ClipResult from a selected moment + its file. */
export function toClipResult(
  moment: SelectedMoment,
  downloadUrl: string,
  thumbnailUrl: string,
  transcript: Transcript,
): ClipResult {
  return {
    downloadUrl,
    thumbnailUrl,
    viralScore: moment.viralScore,
    confidence: moment.confidence,
    durationSec: Math.round(moment.endSec - moment.startSec),
    timestamp: { startSec: moment.startSec, endSec: moment.endSec },
    transcriptSnippet: moment.transcriptSnippet,
    speakers: moment.speakers,
    reasons: moment.reasons,
    caption: moment.caption,
    hashtags: moment.hashtags,
    evidence: buildEvidence(transcript),
  };
}

/**
 * Full clip pipeline for one job:
 * download -> transcribe -> analyze -> clip -> assemble delivery.
 * Thumbnails and subtitle burn arrive in later phases.
 */
export async function runPipeline(
  job: ClipJob,
  hooks: PipelineHooks,
): Promise<void> {
  const workDir = join(config.STORAGE_DIR, job.id);
  await mkdir(workDir, { recursive: true });

  hooks.setStatus("downloading");
  const videoPath = await download(job.brief.url, workDir);
  hooks.setStatus("downloading", { sourcePath: videoPath });

  hooks.setStatus("transcribing");
  const transcript = await transcribe(videoPath);

  if (transcript.durationSec > config.MAX_SOURCE_SECONDS) {
    throw new Error(
      `Source is ${transcript.durationSec}s, over the ${config.MAX_SOURCE_SECONDS}s cap`,
    );
  }

  hooks.setStatus("analyzing", { transcriptCache: transcript });
  const { selected: moments, runnerUps } = await analyze(transcript, job.brief);
  if (moments.length === 0) {
    throw new Error("No suitable moments found for the brief");
  }

  hooks.setStatus("clipping", { runnerUps });
  const results: ClipResult[] = [];
  for (let i = 0; i < moments.length; i++) {
    const moment = moments[i]!;
    const filename = `clip-${i + 1}.mp4`;
    const output = join(workDir, filename);
    await clip({
      input: videoPath,
      output,
      startSec: moment.startSec,
      endSec: moment.endSec,
      aspectRatio: job.terms.aspectRatio,
    });
    // Real download/thumbnail URLs are assigned in the storage phase.
    results.push(
      toClipResult(
        moment,
        `/clips/${job.id}/${filename}`,
        "",
        transcript,
      ),
    );
  }

  // Source is kept for the revision window; cleanup removes it by TTL.
  hooks.setStatus("done", { output: results });
  logger.info({ jobId: job.id, clips: results.length }, "Pipeline complete");
}

/**
 * Re-clip rejected moments using the cached transcript and kept source (no
 * re-download, no re-ASR). Feedback is folded into the brief for re-analysis.
 */
export async function reviseClips(
  job: ClipJob,
  rejections: ClipRejection[],
  hooks: PipelineHooks,
): Promise<void> {
  if (!job.sourcePath || !job.transcriptCache) {
    throw new Error("Revision unavailable: source or transcript expired");
  }
  hooks.setStatus("revising");

  const feedback = rejections
    .map((r) => `Clip ${r.clipIndex + 1}: ${r.feedback}`)
    .join("; ");
  const revisedBrief = {
    ...job.brief,
    prompt: `${job.brief.prompt}\nRevision feedback: ${feedback}`,
  };

  const { selected: moments } = await analyze(job.transcriptCache, revisedBrief);
  if (moments.length === 0) {
    throw new Error("No alternative moments found for the revision feedback");
  }

  const results = [...(job.output ?? [])];
  const workDir = join(config.STORAGE_DIR, job.id);
  const round = job.revisionsUsed + 1;

  for (let k = 0; k < rejections.length; k++) {
    const idx = rejections[k]!.clipIndex;
    const moment = moments[k % moments.length]!;
    if (idx < 0 || idx >= results.length) continue;
    const filename = `clip-${idx + 1}-r${round}.mp4`;
    const output = join(workDir, filename);
    await clip({
      input: job.sourcePath,
      output,
      startSec: moment.startSec,
      endSec: moment.endSec,
      aspectRatio: job.terms.aspectRatio,
    });
    results[idx] = toClipResult(
      moment,
      `/clips/${job.id}/${filename}`,
      "",
      job.transcriptCache,
    );
  }

  hooks.setStatus("done", { output: results, revisionsUsed: round });
  logger.info({ jobId: job.id, round }, "Revision complete");
}
