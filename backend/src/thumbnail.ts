import { mkdtempSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { run } from "./exec.js";
import { logger } from "./logger.js";

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
  /** Optional text to overlay at the bottom (caption). */
  overlayText?: string;
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
  // If overlay text, render a thumbnail card: gradient bottom bar + bold text.
  if (spec.overlayText) {
    const tmpOut = out.replace(/\.jpg$/, "_raw.jpg");
    await thumbnail({ input: spec.input, output: tmpOut, atSec: bestSec });

    const tagline = spec.overlayText
      .replace(/\\/g, "\\\\")
      .replace(/:/g, "\\:")
      .replace(/'/g, "'\\\\\\''")
      .trim();

    // Two-layer approach: gradient overlay + text
    const res = await run(
      "ffmpeg",
      [
        "-y", "-i", tmpOut,
        "-vf",
        // Bottom 35% gradient overlay + bold white text centred
        `split[img][ovr];` +
        `[ovr]drawbox=x=0:y=ih*0.65:w=iw:h=ih*0.35:color=black@0.6:t=fill[grad];` +
        `[img][grad]overlay=0:0,` +
        `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:` +
        `text='${tagline}':fontsize=38:fontcolor=white@0.95:` +
        `box=0:x=(w-text_w)/2:y=h*0.78-text_h/2`,
        "-q:v", "2",
        out,
      ],
      { timeoutMs: 30_000 },
    );
    try { unlinkSync(tmpOut); } catch { /* ignore */ }
    if (res.code !== 0) {
      logger.warn({ err: res.stderr.slice(-200) }, "Thumbnail card failed; using raw frame");
      try { renameSync(tmpOut, out); } catch { /* ignore */ }
    }
    return out;
  }

  return thumbnail({ input: spec.input, output: out, atSec: bestSec });
}
