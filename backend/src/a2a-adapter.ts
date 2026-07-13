import { basename } from "node:path";
import type { AspectRatio, Brief, Delivery, Platform } from "./types.js";

/**
 * Bridge between an OKX A2A job and OKClip. The onchainos ASP agent owns the
 * A2A protocol (apply / accept / deliver / escrow via the CLI); these pure
 * helpers turn an accepted job into a Brief and a delivered result into an
 * XMTP-friendly summary.
 */

/** The fields an ASP agent can extract from an accepted A2A job. */
export interface A2AJobInput {
  /** The task description (natural language). */
  description: string;
  /** Structured service params the user filled, if any. */
  serviceParams?: Record<string, unknown>;
}

const YT_RE =
  /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+|youtube\.com\/shorts\/[\w-]+)/i;

/** Pull the first YouTube URL out of free text. */
export function extractYouTubeUrl(text: string): string | undefined {
  return text.match(YT_RE)?.[0];
}

/** Parse a clip count like "3 clips" / "make 5 clips" from text. */
export function parseClipCount(text: string): number | undefined {
  const m = text.match(/(\d+)\s*clips?/i);
  if (!m) return undefined;
  return Math.max(1, Math.min(5, parseInt(m[1]!, 10)));
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
}
function asAspect(v: unknown): AspectRatio | undefined {
  return v === "16:9" || v === "9:16" || v === "1:1" ? v : undefined;
}

/** Auto-detect platform from prompt text. */
export function detectPlatform(text: string): {
  platform?: Platform;
  aspect?: AspectRatio;
  maxSeconds?: number;
} {
  const s = text.toLowerCase();
  if (s.includes("tiktok") || s.includes("tt"))
    return { platform: "tiktok", aspect: "9:16", maxSeconds: 60 };
  if (s.includes("reels") || s.includes("reel"))
    return { platform: "reels", aspect: "9:16", maxSeconds: 90 };
  if (s.includes("shorts") || s.includes("short"))
    return { platform: "shorts", aspect: "9:16", maxSeconds: 60 };
  if (s.includes("youtube") || s.includes("yt"))
    return { platform: "youtube", aspect: "16:9" };
  return {};
}

/**
 * Turn an accepted A2A job into a Brief. Service params win; anything missing
 * is inferred from the description. Throws if no source URL can be found.
 */
export function parseJobToBrief(job: A2AJobInput): Brief {
  const p = job.serviceParams ?? {};
  const url = asString(p.url) ?? extractYouTubeUrl(job.description);
  if (!url) {
    throw new Error("No YouTube URL found in service params or description");
  }
  const clipCount =
    asNumber(p.clipCount) ?? parseClipCount(job.description) ?? 1;

  const detected = detectPlatform(job.description);

  return {
    url,
    prompt: asString(p.prompt) ?? job.description,
    clipCount: Math.max(1, Math.min(5, Math.round(clipCount))),
    aspectRatio: asAspect(p.aspectRatio) ?? detected.aspect,
    maxClipSeconds: asNumber(p.maxClipSeconds) ?? detected.maxSeconds,
    language: asString(p.language),
  };
}

/** Format seconds as m:ss. */
function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Render a delivered result as a compact text summary the ASP agent can send
 * over XMTP alongside the clip file attachments.
 */
export function buildDeliverySummary(delivery: Delivery): string {
  if (delivery.clips.length === 0) {
    return delivery.message;
  }
  const lines = [`OKClip delivered ${delivery.clips.length} clip(s):`, ""];
  delivery.clips.forEach((c, i) => {
    const range = `${fmt(c.timestamp.startSec)}-${fmt(c.timestamp.endSec)}`;
    lines.push(
      `${i + 1}. [${range}] viral ${c.viralScore}/95 · ${c.durationSec}s · file: ${basename(c.downloadUrl)}`,
    );
    if (c.caption) lines.push(`   ${c.caption}`);
    if (c.reasons.length) lines.push(`   why: ${c.reasons.join("; ")}`);
  });
  return lines.join("\n");
}
