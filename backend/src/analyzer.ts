import OpenAI from "openai";
import { config } from "./config.js";
import { logger } from "./logger.js";
import type {
  Brief,
  RunnerUpMoment,
  SelectedMoment,
  Transcript,
  TranscriptWord,
} from "./types.js";

/** Analyzer output: the chosen clips plus scored-but-unused candidates. */
export interface AnalysisResult {
  selected: SelectedMoment[];
  runnerUps: RunnerUpMoment[];
}

/** How many extra candidates to surface as runner-ups. */
const MAX_RUNNER_UPS = 3;

/** Viral score is a heuristic and never certainty (see PLAN honesty rules). */
export const MAX_VIRAL_SCORE = 95;

/** Group words into ~15s timestamped segments to keep the prompt compact. */
export function segmentTranscript(
  transcript: Transcript,
  windowSec = 15,
): { start: number; end: number; text: string; speaker?: number }[] {
  const segments: {
    start: number;
    end: number;
    text: string;
    speaker?: number;
  }[] = [];
  let bucket: TranscriptWord[] = [];
  let bucketStart = 0;

  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;
    segments.push({
      start: Math.round(first.start),
      end: Math.round(last.end),
      text: bucket.map((w) => w.word).join(" "),
      speaker: first.speaker,
    });
    bucket = [];
  };

  for (const w of transcript.words) {
    if (bucket.length === 0) bucketStart = w.start;
    bucket.push(w);
    if (w.end - bucketStart >= windowSec) flush();
  }
  flush();
  return segments;
}

/** Build the LLM instruction for moment selection. */
export function buildAnalysisPrompt(
  transcript: Transcript,
  brief: Brief,
): { system: string; user: string } {
  const segments = segmentTranscript(transcript);
  const transcriptBlock = segments
    .map(
      (s) =>
        `[${s.start}-${s.end}s]${s.speaker !== undefined ? ` (spk ${s.speaker})` : ""}: ${s.text}`,
    )
    .join("\n");

  const system = [
    "You are OKClip's moment-selection engine.",
    "Find the best moments in a video transcript for short social clips.",
    "Return STRICT JSON only, no prose.",
    "Each moment must start and end at complete sentence boundaries.",
    "Prefer speaker-aware beats: a question and its answer, a debate, a reveal — use the speaker labels.",
    "When multiple clips are requested, order them so they read as a narrative (hook -> depth -> payoff), not random cuts.",
    "Favor a strong hook in the first seconds (a bold claim, a question, an emotional beat).",
    `viralScore is 0-${MAX_VIRAL_SCORE} (a heuristic, never certainty).`,
    "confidence (0-1) is how well the moment matches the user's brief.",
    "reasons must cite concrete signals (topic match, question->answer, emotional beat, hook), not fluff.",
  ].join(" ");

  const user = [
    `Brief: "${brief.prompt}"`,
    `Transcript language: ${transcript.language} — write caption and hashtags in this language.`,
    `Clips wanted: ${brief.clipCount} (also include up to 3 extra strong candidates as runner-ups, ordered best-first)`,
    `Max clip length: ${brief.maxClipSeconds ?? 60}s`,
    "",
    "Transcript (segment timestamps in seconds):",
    transcriptBlock,
    "",
    "Respond with JSON of the form:",
    `{"moments":[{"startSec":number,"endSec":number,"viralScore":number,"confidence":number,"reasons":[string],"caption":string,"hashtags":[string]}]}`,
  ].join("\n");

  return { system, user };
}

interface RawMoment {
  startSec: number;
  endSec: number;
  viralScore: number;
  confidence: number;
  reasons: string[];
  caption: string;
  hashtags: string[];
}

/** Words that end a sentence when suffixed to a token. */
const SENTENCE_END = /[.!?]$/;

/**
 * Snap a [startSec, endSec] range to complete-sentence boundaries using
 * word-level timing: move the start to the first word after a sentence end at
 * or before it, and the end to the next sentence-ending word.
 */
export function snapToSentenceBoundaries(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
): { startSec: number; endSec: number; snippet: string; speakers: number[] } {
  if (words.length === 0) return { startSec, endSec, snippet: "", speakers: [] };

  let startIdx = words.findIndex((w) => w.start >= startSec);
  if (startIdx === -1) startIdx = 0;
  // Walk back to the word following the previous sentence end.
  while (startIdx > 0 && !SENTENCE_END.test(words[startIdx - 1]!.word)) {
    startIdx--;
  }

  let endIdx = words.findIndex((w) => w.end >= endSec);
  if (endIdx === -1) endIdx = words.length - 1;
  // Walk forward to the next sentence-ending word.
  while (endIdx < words.length - 1 && !SENTENCE_END.test(words[endIdx]!.word)) {
    endIdx++;
  }
  if (endIdx < startIdx) endIdx = startIdx;

  const slice = words.slice(startIdx, endIdx + 1);
  const speakers = [
    ...new Set(
      slice.map((w) => w.speaker).filter((s): s is number => s !== undefined),
    ),
  ];
  return {
    startSec: slice[0]!.start,
    endSec: slice[slice.length - 1]!.end,
    snippet: slice.map((w) => w.word).join(" "),
    speakers,
  };
}

/** Map a speaker index to a friendly label. */
function speakerLabel(index: number, total: number): string {
  if (total <= 1) return "Speaker";
  return index === 0 ? "Host" : `Guest ${index}`;
}

function toSelected(m: RawMoment, transcript: Transcript): SelectedMoment {
  const snapped = snapToSentenceBoundaries(
    transcript.words,
    m.startSec,
    m.endSec,
  );
  return {
    startSec: snapped.startSec,
    endSec: snapped.endSec,
    viralScore: Math.max(0, Math.min(MAX_VIRAL_SCORE, Math.round(m.viralScore))),
    confidence: Math.max(0, Math.min(1, m.confidence)),
    reasons: Array.isArray(m.reasons) ? m.reasons : [],
    transcriptSnippet: snapped.snippet,
    speakers: snapped.speakers.map((s) =>
      speakerLabel(s, transcript.speakerCount),
    ),
    caption: m.caption ?? "",
    hashtags: Array.isArray(m.hashtags) ? m.hashtags : [],
  };
}

/**
 * Parse the LLM JSON, clamp values, snap to sentences, and split into the
 * chosen clips (first clipCount) and runner-up candidates.
 */
/**
 * Extract a JSON object from an LLM reply that may be wrapped in ```json fences
 * or surrounded by prose (not all models honor response_format strictly).
 */
export function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) s = fence[1].trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first) s = s.slice(first, last + 1);
  return s;
}

export function parseMoments(
  raw: string,
  transcript: Transcript,
  clipCount: number,
): AnalysisResult {
  let parsed: { moments?: RawMoment[] };
  try {
    parsed = JSON.parse(extractJson(raw)) as { moments?: RawMoment[] };
  } catch {
    throw new Error("Analyzer returned invalid JSON");
  }
  const all = (parsed.moments ?? [])
    .map((m) => toSelected(m, transcript))
    .filter((m) => m.endSec > m.startSec);

  const selected = all.slice(0, clipCount);
  const runnerUps: RunnerUpMoment[] = all
    .slice(clipCount, clipCount + MAX_RUNNER_UPS)
    .map((m) => ({
      timestamp: { startSec: m.startSec, endSec: m.endSec },
      viralScore: m.viralScore,
      reason: m.reasons[0] ?? m.transcriptSnippet.slice(0, 80),
    }));

  return { selected, runnerUps };
}

/**
 * Select the best moments from a transcript for the given brief, via the LLM.
 * Requires SUMOPOD_API_KEY.
 */
export async function analyze(
  transcript: Transcript,
  brief: Brief,
): Promise<AnalysisResult> {
  if (!config.SUMOPOD_API_KEY) {
    throw new Error("SUMOPOD_API_KEY is not configured");
  }
  const client = new OpenAI({
    apiKey: config.SUMOPOD_API_KEY,
    baseURL: config.SUMOPOD_BASE_URL,
  });

  const { system, user } = buildAnalysisPrompt(transcript, brief);
  const completion = await client.chat.completions.create({
    model: config.SUMOPOD_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    response_format: { type: "json_object" },
    temperature: 0.4,
  });

  const content = completion.choices[0]?.message?.content ?? "{}";
  const result = parseMoments(content, transcript, brief.clipCount);
  logger.info(
    { selected: result.selected.length, runnerUps: result.runnerUps.length },
    "Moment analysis complete",
  );
  return result;
}
