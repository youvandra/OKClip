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
  // ffmpeg writes showinfo to stderr regardless of exit code.
  return parseSceneTimes(res.stderr);
}
