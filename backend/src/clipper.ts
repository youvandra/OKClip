import { run } from "./exec.js";
import { logger } from "./logger.js";
import type { AspectRatio } from "./types.js";

export interface ClipSpec {
  input: string;
  output: string;
  startSec: number;
  endSec: number;
  aspectRatio: AspectRatio;
  /** Subtitle filename to burn in (relative to `cwd`), optional. */
  subtitleFile?: string;
  /** Working directory (so subtitle paths stay simple). */
  cwd?: string;
}

/**
 * Center-crop filter for a target aspect ratio. 16:9 assumes a landscape
 * source and needs no crop. (Face/subject-aware cropping is a Stage 3 upgrade —
 * see PLAN; naive center-crop can clip a speaker off-frame.)
 */
export function aspectFilter(aspect: AspectRatio): string | null {
  switch (aspect) {
    case "9:16":
      return "crop=ih*9/16:ih:(iw-ih*9/16)/2:0";
    case "1:1":
      return "crop=ih:ih:(iw-ih)/2:0";
    case "16:9":
      return null;
  }
}

/** Build the ffmpeg argument vector for cutting one clip. Pure/testable. */
export function buildClipArgs(spec: ClipSpec): string[] {
  const duration = Math.max(0, spec.endSec - spec.startSec);
  const args = [
    "-y",
    "-ss",
    spec.startSec.toFixed(3),
    "-i",
    spec.input,
    "-t",
    duration.toFixed(3),
  ];
  // Chain crop and subtitle-burn filters when both apply.
  const filters: string[] = [];
  const crop = aspectFilter(spec.aspectRatio);
  if (crop) filters.push(crop);
  if (spec.subtitleFile) filters.push(`subtitles=${spec.subtitleFile}`);
  if (filters.length > 0) args.push("-vf", filters.join(","));
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    spec.output,
  );
  return args;
}

/** Cut a single clip with ffmpeg. Returns the output path. */
export async function clip(spec: ClipSpec): Promise<string> {
  const res = await run("ffmpeg", buildClipArgs(spec), {
    timeoutMs: 5 * 60_000,
    cwd: spec.cwd,
  });
  if (res.code !== 0) {
    throw new Error(`ffmpeg failed (${res.code}): ${res.stderr.slice(-500)}`);
  }
  logger.info(
    { output: spec.output, startSec: spec.startSec, endSec: spec.endSec },
    "Clip cut",
  );
  return spec.output;
}
