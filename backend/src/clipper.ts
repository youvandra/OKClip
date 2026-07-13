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
  /** Smart crop offset (0–1). 0.5 = center, 0 = left, 1 = right. */
  cropBias?: number;
}

/**
 * Auto-detect where the action is in the frame by sampling frames and
 * using ffmpeg's cropdetect filter. Returns a bias 0–1 (0=left, 1=right).
 */
export async function detectCropBias(
  input: string,
  startSec: number,
  endSec: number,
): Promise<number> {
  try {
    const midpoint = (startSec + endSec) / 2;
    const res = await run(
      "ffmpeg",
      [
        "-y", "-ss", midpoint.toFixed(1), "-i", input,
        "-t", "3", "-vf", "cropdetect=limit=24:round=2:reset=0",
        "-f", "null", "-",
      ],
      { timeoutMs: 15_000 },
    );
    // cropdetect prints lines like "crop=1280:720:240:0"
    const re = /crop=(\d+):(\d+):(\d+):\d+/g;
    const matches = [...res.stderr.matchAll(re)];
    if (matches.length === 0) return 0.5; // center fallback
    const offsets = matches.map((m) => parseInt(m[3]!, 10));
    const avgOffset = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    // Convert offset to bias: 0 = fully left, 1 = fully right
    const width = parseInt(matches[0]![1]!, 10);
    const sourceWidth = parseInt(matches[0]![1]!, 10) + parseInt(matches[0]![3]!, 10) * 2;
    // The crop W:H:X:Y — X is where the crop starts. If X > 0, subject is right.
    // Bias = X / (sourceWidth - cropWidth). Clip to 0.1–0.9 to avoid edges.
    if (sourceWidth <= width) return 0.5;
    const maxOffset = sourceWidth - width;
    const bias = maxOffset > 0 ? avgOffset / maxOffset : 0.5;
    logger.info({ bias: bias.toFixed(2), samples: matches.length }, "Crop bias detected");
    return Math.max(0.1, Math.min(0.9, bias));
  } catch {
    return 0.5;
  }
}

/**
 * Simple center-crop filter. Uses integer math via floor() to avoid
 * ffmpeg floating-point black-screen bugs with complex filter chains.
 */
function buildCropFilter(aspect: AspectRatio, bias = 0.5): string | null {
  if (aspect === "16:9") return null;
  const targetW = aspect === "9:16"
    ? "floor(ih*9/16/2)*2"
    : "floor(ih/2)*2";
  const offsetX = aspect === "9:16"
    ? `floor((iw-${targetW})*${bias.toFixed(2)}/2)*2`
    : `floor((iw-ih)*${bias.toFixed(2)}/2)*2`;
  return `crop=${targetW}:ih:${offsetX}:0,scale=${targetW}:ih`;
}

export function aspectFilter(aspect: AspectRatio, _sourceAspect?: AspectRatio, bias?: number): string | null {
  const b = bias ?? 0.5;
  return buildCropFilter(aspect, b);
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
  const crop = aspectFilter(spec.aspectRatio, spec.sourceAspect, spec.cropBias);
  if (crop) filters.push(crop);
  if (spec.subtitleFile) {
    filters.push(`subtitles='${spec.subtitleFile}'`);
  }
  if (filters.length > 0) args.push("-vf", filters.join(","));
  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "fast",
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
  if (
    spec.cropBias === undefined &&
    spec.aspectRatio !== "16:9" &&
    spec.aspectRatio !== spec.sourceAspect
  ) {
    spec.cropBias = await detectCropBias(spec.input, spec.startSec, spec.endSec);
    spec.cropBias ??= 0.5;
  }
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
