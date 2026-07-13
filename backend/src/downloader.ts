import { downloadViaLoader } from "./loader-downloader.js";

export interface VideoMeta {
  id: string;
  title: string;
  durationSec: number;
  uploader?: string;
}

/** A download failure mapped to an agent-actionable reason. */
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

/** Extract a YouTube video ID from a URL. */
function videoId(url: string): string {
  const m = url.match(/[?&]v=([\w-]+)/);
  if (m?.[1]) return m[1];
  const short = url.match(/youtu\.be\/([\w-]+)/);
  if (short?.[1]) return short[1];
  return "unknown";
}

/**
 * Fetch metadata without downloading (used during negotiation for pricing).
 * Uses YouTube's oEmbed API — free, no auth needed.
 */
export async function probe(url: string): Promise<VideoMeta> {
  const id = videoId(url);
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  try {
    const res = await fetch(oembed);
    const data = (await res.json()) as { title?: string; author_name?: string };
    return {
      id,
      title: data.title ?? "Untitled",
      durationSec: 0,
      uploader: data.author_name,
    };
  } catch {
    return { id, title: "Untitled", durationSec: 0 };
  }
}

/**
 * Download a video into `destDir`. Returns the file path.
 * Uses loader.to (free 3rd-party API) instead of yt-dlp.
 */
export async function download(
  url: string,
  destDir: string,
  maxHeight = 720,
): Promise<string> {
  return downloadViaLoader(url, destDir, maxHeight);
}
