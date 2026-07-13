import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDeliverySummary,
  extractYouTubeUrl,
  parseClipCount,
  parseJobToBrief,
} from "./a2a-adapter.js";
import type { Delivery } from "./types.js";

test("extractYouTubeUrl finds watch/short/youtu.be links", () => {
  assert.equal(
    extractYouTubeUrl("clip this https://youtu.be/abc123 please"),
    "https://youtu.be/abc123",
  );
  assert.equal(
    extractYouTubeUrl("see https://www.youtube.com/watch?v=xyz now"),
    "https://www.youtube.com/watch?v=xyz",
  );
  assert.equal(extractYouTubeUrl("no link here"), undefined);
});

test("parseClipCount reads a count and clamps", () => {
  assert.equal(parseClipCount("make 3 clips"), 3);
  assert.equal(parseClipCount("9 clips"), 5); // clamped
  assert.equal(parseClipCount("no number"), undefined);
});

test("parseJobToBrief prefers service params, falls back to description", () => {
  const brief = parseJobToBrief({
    description: "3 clips about DeFi from https://youtu.be/abc",
    serviceParams: { clipCount: 2, aspectRatio: "9:16" },
  });
  assert.equal(brief.url, "https://youtu.be/abc");
  assert.equal(brief.clipCount, 2); // param wins over "3 clips"
  assert.equal(brief.aspectRatio, "9:16");
});

test("parseJobToBrief throws without a URL", () => {
  assert.throws(() => parseJobToBrief({ description: "no url" }));
});

test("buildDeliverySummary renders per-clip lines", () => {
  const delivery: Delivery = {
    jobId: "j1",
    status: "done",
    runnerUps: [],
    message: "ok",
    clips: [
      {
        downloadUrl: "/clips/j1/clip-1.mp4",
        thumbnailUrl: "/clips/j1/clip-1.jpg",
        viralScore: 87,
        confidence: 0.8,
        durationSec: 47,
        timestamp: { startSec: 272, endSec: 319 },
        transcriptSnippet: "...",
        speakers: ["Host"],
        reasons: ["topic match: DeFi"],
        caption: "DeFi in 47s",
        hashtags: ["#DeFi"],
        evidence: { sourceDurationSec: 3600, analyzedSegments: 200, asr: "deepgram-nova-2", caveat: "..." },
      },
    ],
  };
  const summary = buildDeliverySummary(delivery);
  assert.match(summary, /delivered 1 clip/);
  assert.match(summary, /4:32-5:19/);
  assert.match(summary, /why: topic match: DeFi/);
  assert.match(summary, /#DeFi/);
});
