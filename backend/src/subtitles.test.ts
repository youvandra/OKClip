import assert from "node:assert/strict";
import { test } from "node:test";
import { assTime, buildAss, buildSrt, srtTime } from "./subtitles.js";
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

test("assTime formats h:mm:ss.cs", () => {
  assert.equal(assTime(0), "0:00:00.00");
  assert.equal(assTime(61.5), "0:01:01.50");
});

test("buildAss emits a styled header and dialogue with relative times", () => {
  const ass = buildAss(words, 10, 12, 2, "9:16");
  assert.match(ass, /\[V4\+ Styles\]/);
  assert.match(ass, /PlayResX: 1080/); // 9:16 canvas
  assert.match(ass, /Style: Default,DejaVu Sans/);
  assert.match(ass, /Dialogue: 0,0:00:00\.00,/); // relative to clip start
  assert.match(ass, /Host: Hello there\./);
  assert.match(ass, /Guest 1: Yes\?/);
});

test("buildAss sizes the canvas per aspect ratio", () => {
  assert.match(buildAss(words, 10, 12, 1, "16:9"), /PlayResX: 1920/);
  assert.match(buildAss(words, 10, 12, 1, "1:1"), /PlayResX: 1080\nPlayResY: 1080/);
});
