import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyPreferences,
  extractKeywords,
  inferPreferences,
} from "./memory.js";
import type { Brief } from "./types.js";

test("extractKeywords drops stopwords and short tokens", () => {
  const kw = extractKeywords("3 best DeFi moments about trading");
  assert.ok(kw.includes("defi"));
  assert.ok(kw.includes("trading"));
  assert.ok(!kw.includes("best"));
  assert.ok(!kw.includes("moments"));
});

test("inferPreferences takes mode aspect, median length, repeated keywords", () => {
  const prefs = inferPreferences("agent-1", [
    { aspectRatio: "9:16", maxClipSeconds: 30, prompt: "defi tutorial clips" },
    { aspectRatio: "9:16", maxClipSeconds: 40, prompt: "defi explainer" },
    { aspectRatio: "16:9", maxClipSeconds: 20, prompt: "gaming highlights" },
  ]);
  assert.equal(prefs.aspectRatio, "9:16"); // mode
  assert.equal(prefs.maxClipSeconds, 30); // median of 30,40,20
  assert.ok(prefs.promptPatterns.includes("defi")); // seen twice
  assert.equal(prefs.sampleCount, 3);
});

test("applyPreferences fills omissions but explicit brief wins", () => {
  const prefs = inferPreferences("a", [
    { aspectRatio: "9:16", maxClipSeconds: 30, prompt: "x" },
  ]);
  const brief: Brief = { url: "u", prompt: "p", clipCount: 3 };
  const filled = applyPreferences(brief, prefs);
  assert.equal(filled.aspectRatio, "9:16");
  assert.equal(filled.maxClipSeconds, 30);

  const explicit: Brief = { ...brief, aspectRatio: "1:1" };
  assert.equal(applyPreferences(explicit, prefs).aspectRatio, "1:1");
});

test("applyPreferences is a no-op without a profile", () => {
  const brief: Brief = { url: "u", prompt: "p", clipCount: 1 };
  assert.deepEqual(applyPreferences(brief, undefined), brief);
});
