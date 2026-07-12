import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSrt, srtTime } from "./subtitles.js";
import type { TranscriptWord } from "./types.js";

test("srtTime formats hh:mm:ss,mmm", () => {
  assert.equal(srtTime(0), "00:00:00,000");
  assert.equal(srtTime(3661.5), "01:01:01,500");
  assert.equal(srtTime(-1), "00:00:00,000");
});

const words: TranscriptWord[] = [
  { word: "Hello", start: 10.0, end: 10.4, speaker: 0 },
  { word: "there.", start: 10.4, end: 10.9, speaker: 0 },
  { word: "Yes?", start: 11.0, end: 11.4, speaker: 1 },
];

test("buildSrt makes relative-timed cues with speaker labels", () => {
  const srt = buildSrt(words, 10, 12, 2);
  assert.match(srt, /00:00:00,000 --> /); // relative to clip start
  assert.match(srt, /Host: Hello there\./);
  assert.match(srt, /Guest 1: Yes\?/);
});

test("buildSrt omits speaker labels for single-speaker audio", () => {
  const srt = buildSrt(words, 10, 12, 1);
  assert.ok(!srt.includes("Host:"));
});
