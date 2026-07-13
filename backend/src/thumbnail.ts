import { run } from "./exec.js";
import { logger } from "./logger.js";

export interface ThumbnailSpec {
  input: string;
  output: string;
  /** Seconds into the source to grab the frame. */
  atSec: number;
}

export interface ClipThumbnailSpec {
  input: string;
  output: string;
  /** Start of the clip in the source (seconds). */
  startSec: number;
  /** End of the clip in the source (seconds). */
  endSec: number;
}

/** Build ffmpeg args to extract a single JPEG frame. Pure/testable. */
export function buildThumbnailArgs(spec: ThumbnailSpec): string[] {
  return [
    "-y",
    "-ss",
    spec.atSec.toFixed(3),
    "-i",
    spec.input,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    spec.output,
  ];
}

/**
 * Extract a frame at a specific timestamp.
 */
export async function thumbnail(spec: ThumbnailSpec): Promise<string> {
  const res = await run("ffmpeg", buildThumbnailArgs(spec), {
    timeoutMs: 60_000,
  });
  if (res.code !== 0) {
    throw new Error(`ffmpeg thumbnail failed (${res.code}): ${res.stderr.slice(-300)}`);
  }
  logger.info({ output: spec.output }, "Thumbnail extracted");
  return spec.output;
}

/**
 * Extract the best frame from a clip range using ffmpeg's built-in
 * `thumbnail` filter. This analyzes frame-to-frame differences and picks
 * the most visually-representative frame within the range.
 */
export async function smartThumbnail(spec: ClipThumbnailSpec): Promise<string> {
  const duration = spec.endSec - spec.startSec;
  if (duration < 2) {
    // Too short for scene analysis — just grab the middle.
    return thumbnail({
      input: spec.input,
      output: spec.output,
      atSec: (spec.startSec + spec.endSec) / 2,
    });
  }

  // Use ffmpeg's `thumbnail` filter which hashes frame differences and picks
  // the frame that differs the most from its neighbours (scene-change peak).
  const res = await run(
    "ffmpeg",
    [
      "-y",
      "-ss", spec.startSec.toFixed(3),
      "-i", spec.input,
      "-t", duration.toFixed(3),
      "-vf", "thumbnail=100",
      "-frames:v", "1",
      "-q:v", "3",
      spec.output,
    ],
    { timeoutMs: 60_000 },
  );

  if (res.code !== 0) {
    // Fall back to 25% heuristic if the filter fails.
    logger.warn({ err: res.stderr.slice(-200) }, "Smart thumbnail failed; falling back to single-frame");
    return thumbnail({
      input: spec.input,
      output: spec.output,
      atSec: spec.startSec + duration * 0.25,
    });
  }

  logger.info({ output: spec.output, range: `${spec.startSec}-${spec.endSec}` }, "Smart thumbnail extracted");
  return spec.output;
}
