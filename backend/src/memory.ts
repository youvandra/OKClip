import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type { AspectRatio, Brief, NegotiatedTerms } from "./types.js";

/**
 * Per-agent style memory — the data moat. Preferences are inferred from an
 * agent's request history and auto-fill omitted brief fields, so repeat use
 * gets more tailored (and switching away loses the accrued profile).
 */
export interface AgentPreferences {
  agentId: string;
  aspectRatio?: AspectRatio;
  maxClipSeconds?: number;
  promptPatterns: string[];
  sampleCount: number;
  updatedAt: number;
}

/** One historical data point folded into the profile. */
export interface HistoryPoint {
  aspectRatio: AspectRatio;
  maxClipSeconds: number;
  prompt: string;
}

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "for", "from", "with", "in", "on",
  "best", "clip", "clips", "video", "moment", "moments", "make", "me", "my",
  "this", "that", "about", "into", "top", "get", "please",
]);

/** Extract salient keywords from a prompt (lowercased, stopwords removed). */
export function extractKeywords(prompt: string): string[] {
  return prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/** Most frequent value in a list, or undefined if empty. */
function mode<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>();
  let best: T | undefined;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/** Median of a numeric list (rounded), or undefined if empty. */
function median(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return Math.round(m);
}

/** Infer a preference profile from an agent's history. Pure. */
export function inferPreferences(
  agentId: string,
  history: HistoryPoint[],
): AgentPreferences {
  const keywordCounts = new Map<string, number>();
  for (const h of history) {
    for (const kw of extractKeywords(h.prompt)) {
      keywordCounts.set(kw, (keywordCounts.get(kw) ?? 0) + 1);
    }
  }
  const promptPatterns = [...keywordCounts.entries()]
    .filter(([, n]) => n >= 2) // seen more than once
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([kw]) => kw);

  return {
    agentId,
    aspectRatio: mode(history.map((h) => h.aspectRatio)),
    maxClipSeconds: median(history.map((h) => h.maxClipSeconds)),
    promptPatterns,
    sampleCount: history.length,
    updatedAt: Date.now(),
  };
}

/**
 * Fill a brief's omitted fields from a preference profile. Explicit brief
 * values always win. Pure.
 */
export function applyPreferences(
  brief: Brief,
  prefs: AgentPreferences | undefined,
): Brief {
  if (!prefs) return brief;
  return {
    ...brief,
    aspectRatio: brief.aspectRatio ?? prefs.aspectRatio,
    maxClipSeconds: brief.maxClipSeconds ?? prefs.maxClipSeconds,
  };
}

// --- persistence -----------------------------------------------------------

interface StoredProfile extends AgentPreferences {
  history: HistoryPoint[];
}

function profilePath(agentId: string): string {
  const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(config.PREFERENCES_DIR, `${safe}.json`);
}

async function loadStored(agentId: string): Promise<StoredProfile | undefined> {
  try {
    const raw = await readFile(profilePath(agentId), "utf8");
    return JSON.parse(raw) as StoredProfile;
  } catch {
    return undefined;
  }
}

/** Read an agent's current inferred preferences, if any. */
export async function getPreferences(
  agentId: string,
): Promise<AgentPreferences | undefined> {
  const stored = await loadStored(agentId);
  if (!stored) return undefined;
  const { history: _h, ...prefs } = stored;
  void _h;
  return prefs;
}

/** Fold a completed job into the agent's profile and persist it. */
export async function recordJob(
  agentId: string,
  terms: NegotiatedTerms,
  brief: Brief,
): Promise<AgentPreferences> {
  const stored = await loadStored(agentId);
  const history = stored?.history ?? [];
  history.push({
    aspectRatio: terms.aspectRatio,
    maxClipSeconds: terms.maxClipSeconds,
    prompt: brief.prompt,
  });
  // Bound history so the profile stays cheap to recompute.
  const bounded = history.slice(-50);
  const prefs = inferPreferences(agentId, bounded);

  await mkdir(config.PREFERENCES_DIR, { recursive: true });
  await writeFile(
    profilePath(agentId),
    JSON.stringify({ ...prefs, history: bounded }, null, 2),
  );
  logger.info(
    { agentId, samples: prefs.sampleCount },
    "Style memory updated",
  );
  return prefs;
}
