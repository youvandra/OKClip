import type { AspectRatio, SubtitleStyle, TranscriptWord } from "./types.js";

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

/** Format seconds as an ASS timestamp (h:mm:ss.cs). */
export function assTime(sec: number): string {
  const clamped = Math.max(0, sec);
  const cs = Math.round((clamped % 1) * 100);
  const total = Math.floor(clamped);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

interface Cue {
  start: number;
  end: number;
  speaker?: number;
  text: string;
}

const SENTENCE_END = /[.!?]$/;
const MAX_WORDS = 10;
const MAX_CUE_SEC = 4;

/** Map a speaker index to a label used as a caption prefix. */
function label(speaker: number | undefined, total: number): string {
  if (speaker === undefined || total <= 1) return "";
  return `Speaker ${speaker + 1}: `;
}

/**
 * Group the words inside [startSec, endSec] into caption cues (times relative
 * to the clip start). Cues break on sentence end, word count, duration, or a
 * speaker change. Shared by the SRT and ASS builders.
 */
export function groupCues(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
): Cue[] {
  const inRange = words.filter((w) => w.end > startSec && w.start < endSec);
  const cues: Cue[] = [];
  let bucket: TranscriptWord[] = [];

  const flush = () => {
    if (bucket.length === 0) return;
    const first = bucket[0]!;
    const last = bucket[bucket.length - 1]!;
    // Clamp to 0 — after scene-refined clip starts, the first words may
    // have already started before the clip boundary.
    cues.push({
      start: Math.max(0, first.start - startSec),
      end: Math.max(0.05, last.end - startSec),
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
  return cues;
}

/** Build a plain SRT track (times relative to the clip start). */
export function buildSrt(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
  speakerCount: number,
): string {
  return groupCues(words, startSec, endSec)
    .map((c, i) => {
      const prefix = label(c.speaker, speakerCount);
      return `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${prefix}${c.text}\n`;
    })
    .join("\n");
}

interface AssStyle {
  playResX: number;
  playResY: number;
  fontSize: number;
  marginV: number;
}

/** Per-aspect ASS canvas + type sizing (PlayRes matches the video aspect). */
function styleFor(aspect: AspectRatio): AssStyle {
  switch (aspect) {
    case "9:16":
      return { playResX: 1080, playResY: 1920, fontSize: 74, marginV: 320 };
    case "1:1":
      return { playResX: 1080, playResY: 1080, fontSize: 64, marginV: 150 };
    case "16:9":
      return { playResX: 1920, playResY: 1080, fontSize: 56, marginV: 90 };
  }
}

/** Escape a caption for an ASS Dialogue line. */
function assText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, " ");
}

/**
 * Build a styled ASS subtitle track with selectable presets:
 *   default — white text, black outline (current viral-clip look)
 *   bold    — yellow text, thick outline, larger
 *   karaoke — word-by-word \k timing fill (words light up as spoken)
 *   minimal — small clean white text, transparent dark bg, no outline
 */
export function buildAss(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
  speakerCount: number,
  aspect: AspectRatio,
  style: SubtitleStyle = "default",
): string {
  const st = styleFor(aspect);
  const header = assHeader(st, style);
  const events = style === "karaoke"
    ? karaokeEvents(words, startSec, endSec, speakerCount, st)
    : groupedEvents(words, startSec, endSec, speakerCount, st, style);
  return header.concat(events).join("\n") + "\n";
}

function assStyleLine(
  fontSize: number,
  marginV: number,
  preset: SubtitleStyle,
): string {
  // Format: Name, Fontname, Fontsize, Primary, Secondary, Outline, Back, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
  const font = fontSize;
  const mv = marginV;
  switch (preset) {
    case "bold":
      // Yellow fill (&H0000FFFF), thick black outline (4), bigger shadow
      return `Style: Default,DejaVu Sans,${font + 10},&H0000FFFF,&H000000FF,&H00000000,&HE0000000,-1,0,0,0,100,100,0,0,1,4,4,2,60,60,${mv + 20},1`;
    case "minimal":
      // Small white text, no outline, dark transparent background bar
      return `Style: Default,DejaVu Sans,${font - 12},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,0,1,2,40,40,${mv},1`;
    default:
      // White fill, black outline, drop shadow
      return `Style: Default,DejaVu Sans,${font},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,5,3,2,80,80,${mv},1`;
  }
}

function assHeader(st: { playResX: number; playResY: number; fontSize: number; marginV: number }, preset: SubtitleStyle): string[] {
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${st.playResX}`,
    `PlayResY: ${st.playResY}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    assStyleLine(st.fontSize, st.marginV, preset),
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
}

function groupedEvents(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
  speakerCount: number,
  st: { fontSize: number; marginV: number },
  style: SubtitleStyle,
): string[] {
  return groupCues(words, startSec, endSec).map((c) => {
    const prefix = label(c.speaker, speakerCount);
    let text = assText(prefix + c.text);
    if (style === "bold") {
      text = `{\\b1}${text}{\\b0}`;
    }
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${text}`;
  });
}

function karaokeEvents(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
  speakerCount: number,
  st: { fontSize: number; marginV: number },
): string[] {
  const inRange = words.filter((w) => w.end > startSec && w.start < endSec);
  // Build sentence groups (4-8 words per screen), then \k inside each.
  const groups: { words: typeof inRange; start: number; end: number }[] = [];
  let buf: typeof inRange = [];
  for (const w of inRange) {
    buf.push(w);
    if (buf.length >= 7 || SENTENCE_END.test(w.word)) {
      groups.push({ words: [...buf], start: buf[0]!.start, end: buf[buf.length - 1]!.end });
      buf = [];
    }
  }
  if (buf.length > 0) {
    groups.push({ words: [...buf], start: buf[0]!.start, end: buf[buf.length - 1]!.end });
  }

  const events: string[] = [];
  const prevWords: typeof inRange = []; // for timing reference
  for (const g of groups) {
    const relStart = Math.max(0, g.start - startSec);
    const relEnd = Math.max(0.05, g.end - startSec);
    const prefix = label(g.words[0]?.speaker, speakerCount);
    // Build \k tags: each word gets \[k][duration in cs][text]
    const parts = g.words.map((w, i) => {
      const prevEnd = i > 0 ? g.words[i - 1]!.end : g.start;
      const dur = Math.round((w.end - prevEnd) * 100);
      return `{\\k${Math.max(1, dur)}}${assText(w.word)}`;
    });
    const text = prefix + parts.join(" ");
    // Karaoke secondary color = the "unfilled" color (dim grey), primary = white (filled)
    // Uses \2c for secondary and \c for primary
    events.push(`Dialogue: 0,${assTime(relStart)},${assTime(relEnd)},Default,,0,0,0,,{\\2c&H00AAAAAA&}${text}`);
  }
  return events;
}
