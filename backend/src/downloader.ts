import { join } from "node:path";
import { config } from "./config.js";
import { run } from "./exec.js";
import { logger } from "./logger.js";

/**
 * Common yt-dlp flags. Injects `--cookies` when configured so downloads work
 * from a datacenter IP (YouTube otherwise returns a "confirm you're not a bot"
 * error). Returns a fresh array each call.
 */
function ytdlpBase(): string[] {
  const base = ["--no-warnings"];
  if (config.YTDLP_PROXY) base.push("--proxy", config.YTDLP_PROXY);
  if (config.YTDLP_COOKIES) base.push("--cookies", config.YTDLP_COOKIES);
  return base;
}

export interface VideoMeta {
  id: string;
  title: string;
  durationSec: number;
  uploader?: string;
}

/** A yt-dlp failure mapped to an agent-actionable reason. */
export class DownloadError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "private"
      | "age_restricted"
      | "unavailable"
      | "unsupported"
      | "unknown",
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

/** Classify a yt-dlp stderr blob into an actionable reason. */
export function classifyError(stderr: string): DownloadError["reason"] {
  const s = stderr.toLowerCase();
  if (s.includes("private video")) return "private";
  if (s.includes("age") && s.includes("restrict")) return "age_restricted";
  if (s.includes("sign in to confirm your age")) return "age_restricted";
  if (
    s.includes("video unavailable") ||
    s.includes("removed") ||
    s.includes("does not exist")
  )
    return "unavailable";
  if (s.includes("unsupported url")) return "unsupported";
  return "unknown";
}

/** Parse a yt-dlp `--dump-json` line into normalized metadata. */
export function parseMeta(json: string): VideoMeta {
  const raw = JSON.parse(json) as {
    id?: string;
    title?: string;
    duration?: number;
    uploader?: string;
  };
  return {
    id: raw.id ?? "unknown",
    title: raw.title ?? "Untitled",
    durationSec: Math.round(raw.duration ?? 0),
    uploader: raw.uploader,
  };
}

export interface PlaylistEntry {
  url: string;
  title: string;
}

/** Parse yt-dlp `--flat-playlist --dump-json` JSON-lines into entries. */
export function parsePlaylist(stdout: string): PlaylistEntry[] {
  return stdout
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const j = JSON.parse(line) as {
        url?: string;
        webpage_url?: string;
        id?: string;
        title?: string;
      };
      return {
        url: j.webpage_url ?? j.url ?? j.id ?? "",
        title: j.title ?? "Untitled",
      };
    })
    .filter((e) => e.url);
}

/** List the videos in a YouTube playlist without downloading them. */
export async function probePlaylist(url: string): Promise<PlaylistEntry[]> {
  const res = await run(
    "yt-dlp",
    [...ytdlpBase(), "--flat-playlist", "--dump-json", url],
    { timeoutMs: 60_000 },
  );
  if (res.code !== 0) {
    throw new DownloadError(res.stderr.trim(), classifyError(res.stderr));
  }
  return parsePlaylist(res.stdout);
}

/** Fetch metadata without downloading (used during negotiation for pricing). */
export async function probe(url: string): Promise<VideoMeta> {
  const res = await run(
    "yt-dlp",
    [...ytdlpBase(), "--dump-json", "--no-playlist", url],
    { timeoutMs: 60_000 },
  );
  if (res.code !== 0) {
    throw new DownloadError(res.stderr.trim(), classifyError(res.stderr));
  }
  return parseMeta(res.stdout.trim().split("\n")[0] ?? "{}");
}

/**
 * Download a video at up to 720p as mp4 into `destDir`. Returns the file path.
 * yt-dlp picks the best mp4 <=720p and merges audio.
 */
export async function download(url: string, destDir: string): Promise<string> {
  const out = join(destDir, "%(id)s.%(ext)s");
  const res = await run(
    "yt-dlp",
    [
      ...ytdlpBase(),
      "-f",
      "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]/b",
      "--merge-output-format",
      "mp4",
      "--no-playlist",
      "-o",
      out,
      "--print",
      "after_move:filepath",
      url,
    ],
    // Residential proxies are slow (~100 KiB/s), and OKClip's real inputs are
    // long-form (podcasts/talks), so allow a generous download window.
    { timeoutMs: 30 * 60_000 },
  );
  if (res.code !== 0) {
    throw new DownloadError(res.stderr.trim(), classifyError(res.stderr));
  }
  const path = res.stdout.trim().split("\n").pop() ?? "";
  if (!path) throw new DownloadError("yt-dlp produced no file", "unknown");
  logger.info({ url, path }, "Video downloaded");
  return path;
}
