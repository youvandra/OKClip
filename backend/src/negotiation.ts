import type { VideoMeta } from "./downloader.js";
import type {
  AspectRatio,
  Brief,
  NegotiatedTerms,
  NegotiationResult,
  PriceBreakdown,
} from "./types.js";

/** Base price per clip-count tier (source <= 30 min), in USDT. */
const BASE_TIERS: Record<number, number> = { 1: 0.5, 3: 1, 5: 1.5 };

/** Surcharge per additional 30-minute block beyond the first. */
const SURCHARGE_PER_BLOCK = 0.5;
const BLOCK_SECONDS = 30 * 60;

/** Interpolate a base price for any 1..5 clip count. */
export function basePrice(clipCount: number): number {
  const n = Math.max(1, Math.min(5, clipCount));
  if (BASE_TIERS[n] !== undefined) return BASE_TIERS[n]!;
  // Linear between known tiers (2 and 4).
  return Math.round((0.5 + (n - 1) * 0.25) * 100) / 100;
}

/** Compute a transparent price breakdown for a brief + source length. */
export function priceFor(
  clipCount: number,
  durationSec: number,
): PriceBreakdown {
  const base = basePrice(clipCount);
  const extraBlocks = Math.max(
    0,
    Math.ceil(durationSec / BLOCK_SECONDS) - 1,
  );
  const surcharge = extraBlocks * SURCHARGE_PER_BLOCK;
  const total = base + surcharge;
  return {
    baseUsdt: base.toFixed(2),
    lengthSurchargeUsdt: surcharge.toFixed(2),
    totalUsdt: total.toFixed(2),
    note:
      extraBlocks > 0
        ? `Base ${base.toFixed(2)} + ${extraBlocks} length block(s) x ${SURCHARGE_PER_BLOCK.toFixed(2)}`
        : `Base ${base.toFixed(2)}, source under 30 min`,
  };
}

const VERTICAL_HINTS = ["tiktok", "reel", "reels", "short", "shorts", "vertical", "9:16"];
const SQUARE_HINTS = ["square", "1:1", "instagram feed"];

/** Infer the target aspect ratio from the brief text. */
export function inferAspect(prompt: string, explicit?: AspectRatio): AspectRatio {
  if (explicit) return explicit;
  const p = prompt.toLowerCase();
  if (VERTICAL_HINTS.some((h) => p.includes(h))) return "9:16";
  if (SQUARE_HINTS.some((h) => p.includes(h))) return "1:1";
  return "16:9";
}

/**
 * Produce a negotiation result for a brief and (optional) probed metadata.
 * Declines out-of-scope work, otherwise proposes priced terms while stating
 * the choices it inferred so the requesting agent can confirm — this is the
 * A2A judgment layer, not a fixed API.
 */
export function negotiate(
  brief: Brief,
  meta: VideoMeta | undefined,
  maxSourceSeconds: number,
): NegotiationResult {
  if (brief.clipCount < 1 || brief.clipCount > 5) {
    return {
      kind: "clarify",
      questions: ["How many clips would you like? I support 1 to 5 per video."],
    };
  }

  const durationSec = meta?.durationSec ?? 0;
  if (durationSec > maxSourceSeconds) {
    const mins = Math.round(durationSec / 60);
    const cap = Math.round(maxSourceSeconds / 60);
    return {
      kind: "decline",
      reason: `Source is ~${mins} min, over the ${cap} min limit. Split the URL or narrow the range and I can clip it.`,
    };
  }

  const aspectRatio = inferAspect(brief.prompt, brief.aspectRatio);
  const maxClipSeconds =
    brief.maxClipSeconds ?? (aspectRatio === "16:9" ? 60 : 30);
  const priceBreakdown = priceFor(brief.clipCount, durationSec);

  const terms: NegotiatedTerms = {
    clipCount: brief.clipCount,
    aspectRatio,
    maxClipSeconds,
    priceUsdt: priceBreakdown.totalUsdt,
    revisionRounds: 1,
  };

  const assumptions: string[] = [];
  if (!brief.aspectRatio) {
    assumptions.push(
      `aspect ratio ${aspectRatio} (inferred from the brief; say the word to change it)`,
    );
  }
  if (!brief.maxClipSeconds) {
    assumptions.push(`max clip length ${maxClipSeconds}s`);
  }

  return { kind: "proposal", terms, priceBreakdown, assumptions };
}
