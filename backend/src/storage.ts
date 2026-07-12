import { readdir, rm, stat } from "node:fs/promises";
import { isAbsolute, join, normalize, resolve } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";

/**
 * Resolve a clip file path inside the job's storage directory, rejecting any
 * path traversal. Returns undefined if the request escapes the root.
 */
export function resolveClipPath(
  jobId: string,
  filename: string,
): string | undefined {
  if (jobId.includes("/") || jobId.includes("..")) return undefined;
  const root = resolve(config.STORAGE_DIR, jobId);
  const target = resolve(root, normalize(filename));
  if (target !== root && !target.startsWith(root + "/")) return undefined;
  if (isAbsolute(filename) || filename.includes("..")) return undefined;
  return target;
}

/** Whether a file/dir modified at `mtimeMs` is past its TTL. Pure. */
export function isExpired(mtimeMs: number, now: number, ttlMs: number): boolean {
  return now - mtimeMs > ttlMs;
}

/** Delete job directories older than the clip TTL. Returns removed count. */
export async function cleanupExpired(now = Date.now()): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(config.STORAGE_DIR);
  } catch {
    return 0; // storage dir not created yet
  }
  for (const entry of entries) {
    const dir = join(config.STORAGE_DIR, entry);
    try {
      const s = await stat(dir);
      if (s.isDirectory() && isExpired(s.mtimeMs, now, config.CLIP_TTL_MS)) {
        await rm(dir, { recursive: true, force: true });
        removed++;
      }
    } catch {
      // Ignore races where the dir vanished mid-scan.
    }
  }
  if (removed > 0) logger.info({ removed }, "Cleaned up expired clip jobs");
  return removed;
}

/** Start a periodic cleanup sweep. Returns the timer so it can be cleared. */
export function startCleanup(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
  const timer = setInterval(() => {
    void cleanupExpired();
  }, intervalMs);
  timer.unref();
  return timer;
}
