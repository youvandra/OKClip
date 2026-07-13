import { mkdtempSync, unlinkSync, rmdirSync } from "node:fs";
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

  return thumbnail({
    input: spec.input,
    output: spec.output,
    atSec: bestSec,
  });
}
