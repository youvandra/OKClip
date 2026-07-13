import { mkdtempSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "./exec.js";
import { logger } from "./logger.js";
import type { AspectRatio } from "./types.js";

export interface ThumbnailSpec {
  input: string;
  output: string;
  atSec: number;
}

export interface ClipThumbnailSpec {
  input: string;
  output: string;
  startSec: number;
  endSec: number;
  overlayText?: string;
  language?: string;
  aspectRatio?: AspectRatio;
}

export function buildThumbnailArgs(spec: ThumbnailSpec): string[] {
  return [
    "-y", "-ss", spec.atSec.toFixed(3), "-i", spec.input,
    "-frames:v", "1", "-q:v", "3", spec.output,
  ];
}

export async function thumbnail(spec: ThumbnailSpec): Promise<string> {
  const res = await run("ffmpeg", buildThumbnailArgs(spec), {
    timeoutMs: 60_000,
  });
  if (res.code !== 0) {
    throw new Error(`ffmpeg thumbnail failed (${res.code}): ${res.stderr.slice(-300)}`);
  }
  return spec.output;
}

/**
 * Estimate frame sharpness using ffmpeg's `select`+`signalstats` filter.
 * Returns 0–1; higher = sharper.
 */
async function frameSharpness(
  input: string,
  atSec: number,
): Promise<number> {
  const res = await run(
    "ffmpeg",
    [
      "-y", "-ss", atSec.toFixed(3), "-i", input,
      "-frames:v", "1",
      "-vf", "signalstats",
      "-f", "null", "-",
    ],
    { timeoutMs: 15_000 },
  );
  // signalstats prints YMIN/YMAX/YAVG/YDIFF per-frame to stderr
  const m = res.stderr.match(/YDIFF:\s*([\d.]+)/);
  return m ? parseFloat(m[1]!) / 255 : 0;
}

/**
 * Pick the best frame from the clip by sampling 3 positions (15/25/35%)
 * and choosing the sharpest. This is fast, deterministic, and avoids
 * the resolution bugs of the `thumbnail` filter.
 */
export async function smartThumbnail(spec: ClipThumbnailSpec): Promise<string> {
  const duration = spec.endSec - spec.startSec;
  const candidates = [15, 25, 35].map((pct) =>
    spec.startSec + duration * (pct / 100),
  );

  let bestSec = candidates[1]!; // default 25%
  let bestSharpness = 0;

  for (const sec of candidates) {
    try {
      const s = await frameSharpness(spec.input, sec);
      if (s > bestSharpness) {
        bestSharpness = s;
        bestSec = sec;
      }
    } catch {
      // ignore — keep previous best
    }
  }

  logger.info(
    { bestSec: bestSec.toFixed(2), bestSharpness: bestSharpness.toFixed(3) },
    "Smart thumbnail selected",
  );

  const out = spec.output;
  const aspect = spec.aspectRatio ?? "16:9";

  if (spec.overlayText) {
    // Step 1: extract best frame from source
    const rawOut = out.replace(/\.jpg$/, "_raw.jpg");
    await thumbnail({ input: spec.input, output: rawOut, atSec: bestSec });

    // Step 2: crop to match target aspect ratio (e.g., 16:9 source → 9:16 thumb)
    const croppedOut = out.replace(/\.jpg$/, "_crop.jpg");
    if (aspect !== "16:9") {
      await cropToAspect(
        rawOut,
        croppedOut,
        aspect,
        bestSharpness,
      );
    } else {
      renameSync(rawOut, croppedOut);
    }

    // Step 3: render text overlay with modern thumbnail styling
    const font = (spec.language ?? "en").toLowerCase().startsWith("zh") ||
      (spec.language ?? "en").toLowerCase().startsWith("ja") ||
      (spec.language ?? "en").toLowerCase().startsWith("ko")
      ? "fontfile=/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc"
      : "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

    const text = prepareText(spec.overlayText, aspect);
    const res = await run(
      "ffmpeg",
      ["-y", "-i", croppedOut, "-vf", text, "-q:v", "2", out],
      { timeoutMs: 30_000 },
    );

    try { unlinkSync(rawOut); unlinkSync(croppedOut); } catch { /* ignore */ }
    if (res.code !== 0) {
      logger.warn({ err: res.stderr.slice(-200) }, "Thumbnail card failed");
      try { renameSync(rawOut, out); } catch { /* ignore */ }
    }
    return out;
  }

  return thumbnail({ input: spec.input, output: out, atSec: bestSec });
}

/** Crop a frame to a target aspect ratio via ffmpeg. */
async function cropToAspect(
  input: string,
  output: string,
  aspect: AspectRatio,
  _sharpness: number,
): Promise<void> {
  const crop = aspect === "9:16"
    ? "crop=ih*9/16:ih,scale=-2:ih"
    : "crop=ih:ih,scale=-2:ih";
  const res = await run(
    "ffmpeg",
    ["-y", "-i", input, "-vf", crop, "-q:v", "2", output],
    { timeoutMs: 15_000 },
  );
  if (res.code !== 0) {
    renameSync(input, output);
  }
}

/** Build drawtext filter for modern thumbnail look. */
function prepareText(raw: string, aspect: AspectRatio): string {
  const text = raw.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "'\\\\\\''").trim();
  const isVertical = aspect === "9:16";
  const font = isVertical
    ? "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    : "fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";

  if (isVertical) {
    // TikTok/Reels style: big text filling width, gradient bottom, stroke
    return [
      // Semi-transparent gradient bar at bottom 30%
      `drawbox=x=0:y=ih*0.75:w=iw:h=ih*0.25:color=black@0.5:t=fill`,
      // Text with black stroke (shadow) for readability, large, centered
      `drawtext=${font}:text='${text}':fontsize=36:fontcolor=white@0.95:bordercolor=black@0.6:borderw=3:x=(w-text_w)/2:y=h*0.84-text_h/2`,
    ].join(",");
  } else {
    // YouTube 16:9 style: two lines, bold headline
    return [
      `drawbox=x=0:y=ih*0.68:w=iw:h=ih*0.32:color=black@0.5:t=fill`,
      `drawtext=${font}:text='${text}':fontsize=42:fontcolor=white@0.95:bordercolor=black@0.6:borderw=3:x=(w-text_w)/2:y=h*0.80-text_h/2`,
    ].join(",");
  }
}
