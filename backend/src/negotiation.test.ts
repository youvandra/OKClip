import assert from "node:assert/strict";
import { test } from "node:test";
import type { VideoMeta } from "./downloader.js";
import { basePrice, inferAspect, negotiate, priceFor } from "./negotiation.js";
import type { Brief } from "./types.js";

const MAX = 2 * 60 * 60;

function meta(durationSec: number): VideoMeta {
  return { id: "x", title: "t", durationSec };
}

const brief = (over: Partial<Brief> = {}): Brief => ({
  url: "https://youtu.be/x",
  prompt: "3 best DeFi moments",
  clipCount: 3,
  ...over,
});

test("basePrice matches known tiers and interpolates", () => {
  assert.equal(basePrice(1), 0.5);
  assert.equal(basePrice(3), 1);
  assert.equal(basePrice(5), 1.5);
  assert.equal(basePrice(2), 0.75);
});

test("priceFor adds a surcharge per 30-min block", () => {
  assert.equal(priceFor(3, 20 * 60).totalUsdt, "1.00"); // under 30 min
  assert.equal(priceFor(3, 45 * 60).totalUsdt, "1.50"); // one extra block
  assert.equal(priceFor(3, 75 * 60).totalUsdt, "2.00"); // two extra blocks
});

test("inferAspect reads platform hints", () => {
  assert.equal(inferAspect("make it for tiktok"), "9:16");
  assert.equal(inferAspect("vertical clips"), "9:16");
  assert.equal(inferAspect("square for feed"), "1:1");
  assert.equal(inferAspect("just clip it"), "16:9");
  assert.equal(inferAspect("anything", "16:9"), "16:9"); // explicit wins
});

test("negotiate declines sources over the cap", () => {
  const res = negotiate(brief(), meta(3 * 60 * 60), MAX);
  assert.equal(res.kind, "decline");
});

test("negotiate proposes priced terms with inferred assumptions", () => {
  const res = negotiate(brief({ prompt: "3 tiktok clips" }), meta(45 * 60), MAX);
  assert.equal(res.kind, "proposal");
  if (res.kind !== "proposal") return;
  assert.equal(res.terms.aspectRatio, "9:16");
  assert.equal(res.terms.priceUsdt, "1.50");
  assert.ok(res.assumptions.length > 0);
});

test("negotiate clarifies an invalid clip count", () => {
  const res = negotiate(brief({ clipCount: 9 }), meta(600), MAX);
  assert.equal(res.kind, "clarify");
});
