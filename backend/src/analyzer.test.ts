import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_VIRAL_SCORE,
  parseMoments,
  segmentTranscript,
  snapToSentenceBoundaries,
} from "./analyzer.js";
import type { Transcript, TranscriptWord } from "./types.js";

function words(spec: [string, number, number, number?][]): TranscriptWord[] {
  return spec.map(([word, start, end, speaker]) => ({
    word,
    start,
    end,
    speaker,
  }));
}

const sample: TranscriptWord[] = words([
  ["Hello", 0, 0.5, 0],
  ["there.", 0.5, 1.0, 0],
  ["This", 1.1, 1.4, 0],
  ["is", 1.4, 1.6, 0],
  ["DeFi.", 1.6, 2.2, 0],
  ["Next", 2.3, 2.6, 1],
  ["topic", 2.6, 3.0, 1],
  ["now.", 3.0, 3.4, 1],
]);

const transcript: Transcript = {
  words: sample,
  text: sample.map((w) => w.word).join(" "),
  language: "en",
  durationSec: 4,
  speakerCount: 2,
};

test("snapToSentenceBoundaries expands to complete sentences", () => {
  // Ask for 1.2..1.7 (mid "This is DeFi.") -> should snap to that sentence.
  const snap = snapToSentenceBoundaries(sample, 1.2, 1.7);
  assert.equal(snap.snippet, "This is DeFi.");
  assert.equal(snap.startSec, 1.1);
  assert.equal(snap.endSec, 2.2);
  assert.deepEqual(snap.speakers, [0]);
});

test("segmentTranscript groups words into timed segments", () => {
  const segs = segmentTranscript(transcript, 1.5);
  assert.ok(segs.length >= 2);
  assert.equal(segs[0]?.start, 0);
});

test("parseMoments clamps score, snaps, and drops invalid", () => {
  const raw = JSON.stringify({
    moments: [
      {
        startSec: 1.2,
        endSec: 1.7,
        viralScore: 150,
        confidence: 2,
        reasons: ["topic match: DeFi"],
        caption: "DeFi explained",
        hashtags: ["#DeFi"],
      },
    ],
  });
  const moments = parseMoments(raw, transcript, 3);
  assert.equal(moments.length, 1);
  const m = moments[0]!;
  assert.equal(m.viralScore, MAX_VIRAL_SCORE); // clamped from 150
  assert.equal(m.confidence, 1); // clamped from 2
  assert.equal(m.transcriptSnippet, "This is DeFi.");
  assert.deepEqual(m.speakers, ["Host"]);
});

test("parseMoments respects clipCount", () => {
  const raw = JSON.stringify({
    moments: [
      { startSec: 0, endSec: 1, viralScore: 50, confidence: 0.5, reasons: [], caption: "", hashtags: [] },
      { startSec: 1.1, endSec: 2.2, viralScore: 60, confidence: 0.6, reasons: [], caption: "", hashtags: [] },
    ],
  });
  assert.equal(parseMoments(raw, transcript, 1).length, 1);
});

test("parseMoments throws on invalid JSON", () => {
  assert.throws(() => parseMoments("not json", transcript, 3));
});
