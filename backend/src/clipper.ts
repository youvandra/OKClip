import { run } from "./exec.js";
import { logger } from "./logger.js";
import type { AspectRatio } from "./types.js";

export interface ClipSpec {
  input: string;
  output: string;
  startSec: number;
  endSec: number;
  aspectRatio: AspectRatio;
  sourceAspect?: AspectRatio;
  /** Subtitle filename to burn in (relative to `cwd`), optional. */
  subtitleFile?: string;
  /** Working directory (so subtitle paths stay simple). */
  cwd?: string;
}

/**
 * Center-crop filter for a target aspect ratio. 16:9 assumes a landscape
 * source and needs no crop. Returns null for source-aspect matches.
 * (Face/subject-aware cropping is a Stage 3 upgrade —
 * see PLAN; naive center-crop can clip a speaker off-frame.)
 */
export function aspectFilter(aspect: AspectRatio, sourceAspect?: AspectRatio): string | null {
  if (sourceAspect && aspect === sourceAspect) return null;
  const w = "iw";
  const h = "ih";
  switch (aspect) {
    case "9:16":
      if (sourceAspect === "9:16") return null;
      return `crop=${h}*9/16:${h}:(${w}-${h}*9/16)/2:0`;
    case "1:1":
      if (sourceAspect === "1:1") return null;
      return `crop=${h}:${h}:(${w}-${h})/2:0`;
    case "16:9":
      return null;
  }
}

/** Build the ffmpeg argument vector for cutting one clip. Pure/testable. */
export function buildClipArgs(spec: ClipSpec): string[] {
  const duration = Math.max(0.5, spec.endSec - spec.startSec);
  // Output seeking (-ss after -i) for frame-accurate cuts at the cost of
  // having to decode from the previous keyframe. Short clips make this cheap.
  const args = [
    "-y",
    "-i",
    spec.input,
    "-ss",
    spec.startSec.toFixed(3),
    "-t",
    duration.toFixed(3),
  ];
  const filters: string[] = [];
  const crop = aspectFilter(spec.aspectRatio, spec.sourceAspect);
  if (crop) filters.push(crop);
  if (spec.subtitleFile) {
    // `original_size=1` tells libass to respect the PlayRes from the ASS
    // header, keeping font sizes and margins consistent on every video.
    filters.push(`subtitles='${spec.subtitleFile}':original_size=1`);
  }
  if (filters.length > 0) args.push("-vf", filters.join(","));
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-af",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
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
