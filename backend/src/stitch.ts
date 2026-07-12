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
 * highlight reel via the concat demuxer.
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
