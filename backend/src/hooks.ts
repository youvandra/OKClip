import { run } from "./exec.js";

/**
 * Parse `pts_time` values from ffmpeg's showinfo output (emitted after a
 * scene-change select filter) into a sorted list of scene-cut timestamps.
 */
export function parseSceneTimes(stderr: string): number[] {
  const times: number[] = [];
  const re = /pts_time:([0-9]+\.?[0-9]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stderr)) !== null) {
    times.push(parseFloat(match[1]!));
  }
  return times.sort((a, b) => a - b);
}

/**
 * Snap a clip start to the latest scene cut within `windowSec` before it, so
 * the clip opens on a clean visual cut (a stronger hook) rather than mid-shot.
 * Returns the original start if no nearby cut exists.
 */
export function refineStart(
  startSec: number,
  scenes: number[],
  windowSec = 2,
): number {
  let best = startSec;
  for (const t of scenes) {
    if (t <= startSec && t >= startSec - windowSec) best = t;
  }
  return best;
}

/** Detect scene-change timestamps in a video via ffmpeg. */
export async function detectScenes(
  input: string,
  threshold = 0.4,
): Promise<number[]> {
  const res = await run(
    "ffmpeg",
    [
      "-i",
      input,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-",
    ],
    { timeoutMs: 5 * 60_000 },
  );
  if (res.code !== 0 && res.stderr.trim().length === 0) {
    throw new Error(`ffmpeg scene detection failed (${res.code}): ${res.stderr.slice(-300)}`);
  }
  return parseSceneTimes(res.stderr);
}

/**
 * Detect scene cuts near the given candidate timestamps instead of scanning the
 * whole video. Much faster for long sources.
 */
export async function detectScenesNear(
  input: string,
  candidates: number[],
  windowSec = 4,
  threshold = 0.4,
): Promise<number[]> {
  if (candidates.length === 0) return [];
  const times = new Set<number>();
  for (const t of candidates) {
    const start = Math.max(0, t - windowSec);
    const end = t + 0.5; // small overscan past the candidate
    try {
      const res = await run(
        "ffmpeg",
        [
          "-y",
          "-ss", start.toFixed(3),
          "-i", input,
          "-t", (end - start).toFixed(3),
          "-filter:v", `select='gt(scene,${threshold})',showinfo`,
          "-f", "null",
          "-",
        ],
        { timeoutMs: 2 * 60_000 },
      );
      if (res.stderr.trim()) {
        for (const ts of parseSceneTimes(res.stderr)) {
          times.add(Math.round((start + ts) * 1000) / 1000);
        }
      }
    } catch {
      // Skip failed probes — worst case we miss a scene cut.
    }
  }
  return [...times].sort((a, b) => a - b);
}
