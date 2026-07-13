import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";
import { DownloadError } from "./downloader.js";

const API = "https://loader.to/ajax/download.php";
const POLL_MS = 3000;
const MAX_POLL_MS = 10 * 60_000;

interface LoaderResponse {
  success?: boolean;
  id: string;
  title: string;
  progress_url: string;
  format?: string;
}

function qualityLabel(maxHeight: number): string {
  if (maxHeight <= 144) return "144";
  if (maxHeight <= 240) return "240";
  if (maxHeight <= 360) return "360";
  if (maxHeight <= 480) return "480";
  if (maxHeight <= 720) return "720";
  return "1080";
}

async function req(url: string): Promise<any> {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`loader.to HTTP ${res.status}: ${text.slice(0, 200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`loader.to returned non-JSON: ${text.slice(0, 200)}`);
  }
}

/**
 * Download a YouTube video via loader.to (free 3rd-party API).
 * Returns the local file path.
 */
export async function downloadViaLoader(
  url: string,
  destDir: string,
  maxHeight = 720,
): Promise<string> {
  const quality = qualityLabel(maxHeight);
  logger.info({ url, quality }, "Requesting loader.to download");

  const init = (await req(
    `${API}?format=${quality}&url=${encodeURIComponent(url)}`,
  )) as LoaderResponse;

  if (!init.id) {
    throw new DownloadError(
      init as unknown as string ?? "loader.to returned no job id",
      "unsupported",
    );
  }

  logger.info(
    { title: init.title, progressUrl: init.progress_url },
    "loader.to job created — polling for download",
  );

  const started = Date.now();
  let downloadUrl: string | undefined;
  while (!downloadUrl && Date.now() - started < MAX_POLL_MS) {
    await new Promise((r) => setTimeout(r, POLL_MS));
    const status = await req(init.progress_url);
    if (status.download_url) {
      downloadUrl = status.download_url as string;
      break;
    }
    if (status.success === 0 && status.progress < 100) {
      // still processing
    }
  }

  if (!downloadUrl) {
    throw new DownloadError("loader.to timed out waiting for download URL", "unknown");
  }

  logger.info({ downloadUrl: downloadUrl.slice(0, 80) }, "Downloading video from loader.to");

  const ext = ".mp4";
  const videoId = url.match(/[?&]v=([\w-]+)/)?.[1] ?? "video";
  const outPath = join(destDir, `${videoId}${ext}`);
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new DownloadError(
      `loader.to download failed: HTTP ${response.status}`,
      "unknown",
    );
  }

  const fileStream = createWriteStream(outPath);
  const reader = response.body?.getReader();
  if (!reader) {
    throw new DownloadError("loader.to returned empty body", "unknown");
  }

  const buf = await readAll(reader);
  fileStream.write(Buffer.from(buf));
  fileStream.end();

  await new Promise<void>((resolve, reject) => {
    fileStream.on("finish", resolve);
    fileStream.on("error", reject);
  });

  logger.info({ outPath }, "loader.to download complete");
  return outPath;
}

async function readAll(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
