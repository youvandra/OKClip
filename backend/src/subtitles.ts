import type { TranscriptWord } from "./types.js";

/** Format seconds as an SRT timestamp (hh:mm:ss,mmm). */
export function srtTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const ms = Math.round((clamped % 1) * 1000);
  const total = Math.floor(clamped);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

interface Cue {
  start: number;
  end: number;
  speaker?: number;
  text: string;
}

const SENTENCE_END = /[.!?]$/;
const MAX_WORDS = 8;
const MAX_CUE_SEC = 3.5;

/** Map a speaker index to a label used as a caption prefix. */
function label(speaker: number | undefined, total: number): string {
  if (speaker === undefined || total <= 1) return "";
  return speaker === 0 ? "Host: " : `Guest ${speaker}: `;
}

/**
 * Build an SRT subtitle track for the words falling inside [startSec, endSec],
 * with times relative to the clip start and a speaker prefix when diarization
 * shows more than one speaker. Cues break on sentence end, word count, or
 * duration.
 */
export function buildSrt(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
  speakerCount: number,
): string {
  const inRange = words.filter((w) => w.end > startSec && w.start < endSec);
  const cues: Cue[] = [];
  let bucket: TranscriptWord[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;
    cues.push({
      start: first.start - startSec,
      end: last.end - startSec,
      speaker: first.speaker,
      text: bucket.map((w) => w.word).join(" "),
    });
    bucket = [];
  };

  for (const w of inRange) {
    const prev = bucket[0];
    const speakerChanged =
      prev !== undefined && prev.speaker !== w.speaker && bucket.length > 0;
    if (speakerChanged) flush();
    bucket.push(w);
    const dur = w.end - (bucket[0]?.start ?? w.start);
    if (SENTENCE_END.test(w.word) || bucket.length >= MAX_WORDS || dur >= MAX_CUE_SEC) {
      flush();
    }
  }
  flush();

  return cues
    .map((c, i) => {
      const prefix = label(c.speaker, speakerCount);
      return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${prefix}${c.text}\n`;
    })
    .join("\n");
}
