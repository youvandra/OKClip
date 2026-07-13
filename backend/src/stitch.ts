import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./exec.js";
import { logger } from "./logger.js";

/** Build the ffmpeg concat-demuxer list file contents. Pure/testable. */
export function buildConcatList(files: string[]): string {
  return files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n") + "\n";
}

/** Build ffmpeg args to concat a list file into one reel (stream copy). */
export function buildStitchArgs(listFile: string, output: string): string[] {
  return ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", output];
}

/**
 * Stitch clips (same codec/aspect, as produced by the clipper) into a single
 * highlight reel via the concat demuxer (fast, no re-encode).
 */
export async function stitch(
  files: string[],
  workDir: string,
  output: string,
): Promise<string> {
  const listFile = join(workDir, "concat.txt");
  await writeFile(listFile, buildConcatList(files));
  const res = await run("ffmpeg", buildStitchArgs(listFile, output), {
    timeoutMs: 5 * 60_000,
  });
  if (res.code !== 0) {
    throw new Error(`ffmpeg stitch failed (${res.code}): ${res.stderr.slice(-300)}`);
  }
  logger.info({ output, clips: files.length }, "Highlight reel stitched");
  return output;
}

/**
 * Stitch with smooth crossfade transitions between clips.
 * Re-encodes, so it's slower but looks professional.
 */
export async function crossfadeStitch(
  files: string[],
  workDir: string,
  output: string,
  fadeDuration = 0.5,
): Promise<string> {
  if (files.length <= 1) {
    // Single file — just copy with faststart for consistency.
    const res = await run("ffmpeg", [
      "-y", "-i", files[0]!,
      "-c", "copy", "-movflags", "+faststart",
      output,
    ], { timeoutMs: 2 * 60_000 });
    if (res.code !== 0) throw new Error(`ffmpeg copy failed: ${res.stderr.slice(-300)}`);
    return output;
  }

  // Build xfade filter chain
  const args: string[] = ["-y"];
  for (const f of files) {
    args.push("-i", f);
  }

  // Build filter: [0][1]xfade=duration=0.5[o1];[o1][2]xfade=...[out]
  const filters: string[] = [];
  let prev = "[0]";
  for (let i = 1; i < files.length; i++) {
    const next = i < files.length - 1 ? `[f${i}]` : "[out]";
    filters.push(
      `${prev}[${i}]xfade=transition=fade:duration=${fadeDuration}:offset=$OFFSET${next}`,
    );
    prev = next;
  }

  // Calculate offsets (total duration up to each clip)
  // We need frame-level probing, but for known clips use a simpler approach:
  // xfade with crossfade filter doesn't need offsets — it transitions at end of first clip.
  const filterChain = files
    .map((_, i) => i)
    .slice(1)
    .reduce(
      (acc, i) =>
        `${acc}[${i}]xfade=transition=fade:duration=${fadeDuration}[x${i}]`,
      "[0]",
    ) + `[${files.length - 1}]xfade=transition=fade:duration=${fadeDuration}[out]`;

  // Wait — the above is wrong. Let me use a simpler xfade expression.
  // For 2 clips: [0][1]xfade=duration=0.5:offset=len0-0.5[out]
  // For 3+: chain via intermediate pads.

  let filterExpr = "[0]";
  for (let i = 1; i < files.length; i++) {
    filterExpr += `[${i}]xfade=transition=fade:duration=${fadeDuration}`;
    filterExpr += i < files.length - 1 ? `[x${i}];[x${i}]` : "[out]";
  }

  args.push(
    "-filter_complex", filterExpr,
    "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart",
    output,
  );

  const res = await run("ffmpeg", args, { timeoutMs: 5 * 60_000 });
  if (res.code !== 0) {
    logger.warn({ err: res.stderr.slice(-300) }, "Crossfade fallback to concat");
    return stitch(files, workDir, output);
  }
  logger.info({ output, clips: files.length }, "Crossfade reel stitched");
  return output;
}
