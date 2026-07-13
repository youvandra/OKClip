import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { analyze, segmentTranscript } from "./analyzer.js";
import { clip } from "./clipper.js";
import { config } from "./config.js";
import { download } from "./downloader.js";
import { detectScenesNear, refineStart } from "./hooks.js";
import { logger } from "./logger.js";
import { buildAss } from "./subtitles.js";
import { smartThumbnail } from "./thumbnail.js";
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

/** Retry `fn` a few times with exponential backoff. Only retries on transient errors. */
async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries = 2,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = 2 ** attempt * 2000;
        logger.warn(
          { label, attempt: attempt + 1, delayMs: delay, err },
          "Transient failure — retrying",
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
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
 * Produce one finished clip: refine the start to a scene cut (hook), burn
 * speaker-labeled subtitles, cut the segment, and grab a thumbnail. Returns a
 * decision-grade ClipResult. Shared by the initial run and the revision loop.
 */
export async function produceClip(params: {
  jobId: string;
  sourcePath: string;
  workDir: string;
  transcript: Transcript;
  moment: SelectedMoment;
  index: number;
  suffix: string;
  aspectRatio: ClipJob["terms"]["aspectRatio"];
  sourceAspect?: ClipJob["brief"]["sourceAspect"];
  subtitleStyle?: ClipJob["brief"]["subtitleStyle"];
  scenes: number[];
}): Promise<ClipResult> {
  const { jobId, sourcePath, workDir, transcript, moment, index, suffix } =
    params;
  const startSec = refineStart(moment.startSec, params.scenes);
  const base = `clip-${index + 1}${suffix}`;

  const subFile = `${base}.ass`;
  await writeFile(
    join(workDir, subFile),
    buildAss(
      transcript.words,
      startSec,
      moment.endSec,
      transcript.speakerCount,
      params.aspectRatio,
      params.subtitleStyle,
    ),
  );

  const videoFile = `${base}.mp4`;
  await clip({
    input: sourcePath,
    output: join(workDir, videoFile),
    startSec,
    endSec: moment.endSec,
    aspectRatio: params.aspectRatio,
    sourceAspect: params.sourceAspect,
    subtitleFile: subFile,
    cwd: workDir,
  });

  const thumbFile = `${base}.jpg`;
  await smartThumbnail({
    input: sourcePath,
    output: join(workDir, thumbFile),
    startSec,
    endSec: moment.endSec,
    overlayText: moment.caption || undefined,
  });

  return toClipResult(
    { ...moment, startSec },
    `/clips/${jobId}/${videoFile}`,
    `/clips/${jobId}/${thumbFile}`,
    transcript,
  );
}

/**
 * Full clip pipeline for one job:
 * download -> transcribe -> analyze -> clip -> assemble delivery.
 */
export async function runPipeline(
  job: ClipJob,
  hooks: PipelineHooks,
): Promise<void> {
  const workDir = join(config.STORAGE_DIR, job.id);
  await mkdir(workDir, { recursive: true });
  job.startedAt = Date.now();

  hooks.setStatus("downloading");
  const videoPath = await download(
    job.brief.url,
    workDir,
    job.brief.resolution ?? 720,
  );
  hooks.setStatus("downloading", { sourcePath: videoPath });

  hooks.setStatus("transcribing");
  const transcript = await withRetry(
    () => transcribe(videoPath),
    "transcribe",
  );

  if (transcript.durationSec > config.MAX_SOURCE_SECONDS) {
    throw new Error(
      `Source is ${transcript.durationSec}s, over the ${config.MAX_SOURCE_SECONDS}s cap`,
    );
  }

  hooks.setStatus("analyzing", { transcriptCache: transcript });
  const { selected: moments, runnerUps } = await withRetry(
    () => analyze(transcript, job.brief),
    "analyze",
  );
  if (moments.length === 0) {
    throw new Error("No suitable moments found for the brief");
  }

  const minClip = job.brief.minClipSeconds ?? 3;
  const valid = moments.filter(
    (m) => m.endSec - m.startSec >= minClip,
  );
  if (valid.length === 0) {
    throw new Error(
      `All ${moments.length} moments are shorter than the ${minClip}s minimum`,
    );
  }

  hooks.setStatus("clipping", { runnerUps });

  // Scan scene cuts only near candidate start times — far faster than full-video scan.
  let scenes: number[] = [];
  try {
    scenes = await detectScenesNear(
      videoPath,
      valid.map((m) => m.startSec),
    );
  } catch (err) {
    logger.warn({ jobId: job.id, err }, "Scene detection failed; skipping");
  }

  const results: ClipResult[] = [];
  for (let i = 0; i < valid.length; i++) {
    results.push(
      await produceClip({
        jobId: job.id,
        sourcePath: videoPath,
        workDir,
        transcript,
        moment: valid[i]!,
        index: i,
        suffix: "",
        aspectRatio: job.terms.aspectRatio,
        sourceAspect: job.brief.sourceAspect,
        subtitleStyle: job.brief.subtitleStyle,
        scenes,
      }),
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
    results[idx] = await produceClip({
      jobId: job.id,
      sourcePath: job.sourcePath,
      workDir,
      transcript: job.transcriptCache,
      moment,
      index: idx,
      suffix: `-r${round}`,
      aspectRatio: job.terms.aspectRatio,
      scenes: [],
    });
  }

  hooks.setStatus("done", { output: results, revisionsUsed: round });
  logger.info({ jobId: job.id, round }, "Revision complete");
}
