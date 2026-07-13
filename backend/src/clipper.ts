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
  subtitleFile?: string;
  cwd?: string;
  /** Add a short fade in/out (0.3s). Defaults to true. */
  fade?: boolean;
}

/**
 * Center-crop filter for a target aspect ratio. 16:9 assumes a landscape
 * source and needs no crop. Returns null for source-aspect matches.
 *
 * Blur-pillarbox variant: instead of naive center-crop (which cuts off
 * speakers), keeps the full frame and blurs+scales it as background,
 * overlaying the cropped foreground.
 */
export function aspectFilter(aspect: AspectRatio, sourceAspect?: AspectRatio): string | null {
  if (sourceAspect && aspect === sourceAspect) return null;
  const w = "iw";
  const h = "ih";
  switch (aspect) {
    case "9:16": {
      if (sourceAspect === "9:16") return null;
      // Blur-pillarbox: split into background (blurred+scaled) and foreground (cropped)
      const cropW = `${h}*9/16`;
      const offsetX = `(${w}-${cropW})/2`;
      return `[0:v]split[orig][blur];[blur]scale=${cropW}:${h},crop=${cropW}:${h},boxblur=15:5[bg];[orig]crop=${cropW}:${h}:${offsetX}:0[fg];[bg][fg]overlay=0:0`;
    }
    case "1:1": {
      if (sourceAspect === "1:1") return null;
      const cropW = `${h}`;
      const offsetX = `(${w}-${cropW})/2`;
      return `[0:v]split[orig][blur];[blur]scale=${cropW}:${h},crop=${cropW}:${h},boxblur=15:5[bg];[orig]crop=${cropW}:${h}:${offsetX}:0[fg];[bg][fg]overlay=0:0`;
    }
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
    filters.push(`subtitles='${spec.subtitleFile}'`);
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
  // Append fade after -vf to avoid filter-chain conflict. Fade is a video filter
  // so it goes into -vf, not after encoding flags. Fix: insert before -c:v.
  if (spec.fade !== false) {
    const vfIdx = args.indexOf("-vf");
    const fadeFilter = `fade=t=in:d=0.3,fade=t=out:d=0.3:st=${Math.max(0.1, duration - 0.3).toFixed(3)}`;
    if (vfIdx >= 0) {
      args[vfIdx + 1] = `${args[vfIdx + 1]},${fadeFilter}`;
    } else {
      const outIdx = args.indexOf(spec.output);
      args.splice(outIdx, 0, "-vf", fadeFilter);
    }
  }
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
