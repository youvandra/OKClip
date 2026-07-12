import { run } from "./exec.js";
import { logger } from "./logger.js";

export interface ThumbnailSpec {
  input: string;
  output: string;
  /** Seconds into the source to grab the frame. */
  atSec: number;
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
 * Extract a representative frame (the clip midpoint) as the thumbnail.
 * Best-frame scoring and text overlay are layered on top later.
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
