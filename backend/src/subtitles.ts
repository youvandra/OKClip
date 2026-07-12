import type { AspectRatio, TranscriptWord } from "./types.js";

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
const MAX_WORDS = 6;
const MAX_CUE_SEC = 2.8;

/** Map a speaker index to a label used as a caption prefix. */
function label(speaker: number | undefined, total: number): string {
  if (speaker === undefined || total <= 1) return "";
  return speaker === 0 ? "Host: " : `Guest ${speaker}: `;
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
  return s.replace(/\\/g, "\\\\").replace(/\r?\n/g, " ").replace(/\{/g, "(").replace(/\}/g, ")");
}

/**
 * Build a styled ASS subtitle track — big bold white text with a thick outline
 * and drop shadow, centred low in frame. This is the "viral clip" look versus
 * plain SRT. `DejaVu Sans` is used because it ships with the Linux host that
 * burns the clips; libass falls back gracefully if absent.
 */
export function buildAss(
  words: TranscriptWord[],
  startSec: number,
  endSec: number,
  speakerCount: number,
  aspect: AspectRatio,
): string {
  const st = styleFor(aspect);
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${st.playResX}`,
    `PlayResY: ${st.playResY}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // white fill, black outline, semi-transparent shadow; bold; alignment 2 = bottom-centre
    `Style: Default,DejaVu Sans,${st.fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H96000000,-1,0,0,0,100,100,0,0,1,5,3,2,80,80,${st.marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = groupCues(words, startSec, endSec).map((c) => {
    const text = assText(label(c.speaker, speakerCount) + c.text);
    return `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${text}`;
  });
  return header.concat(events).join("\n") + "\n";
}
