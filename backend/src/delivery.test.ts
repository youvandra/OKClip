import assert from "node:assert/strict";
import { test } from "node:test";
import { buildDelivery, canRevise } from "./delivery.js";
import type { ClipJob } from "./types.js";

function job(over: Partial<ClipJob> = {}): ClipJob {
  return {
    id: "j1",
    agentId: "a1",
    status: "done",
    brief: { url: "u", prompt: "p", clipCount: 1 },
    terms: {
      clipCount: 1,
      aspectRatio: "9:16",
      maxClipSeconds: 30,
      priceUsdt: "0.50",
      revisionRounds: 1,
    },
    output: [],
    revisionsUsed: 0,
    createdAt: 0,
    updatedAt: 0,
    ...over,
  };
}

test("buildDelivery reports ready clips and remaining revisions", () => {
  const d = buildDelivery(job({ output: [] }));
  assert.equal(d.status, "done");
  assert.match(d.message, /revision round/);
  assert.equal(d.approved, false);
});

test("buildDelivery surfaces failures", () => {
  const d = buildDelivery(job({ status: "failed", error: "boom" }));
  assert.match(d.message, /boom/);
});

test("canRevise respects rounds and approval", () => {
  assert.equal(canRevise(job()), true);
  assert.equal(canRevise(job({ approved: true })), false);
  assert.equal(canRevise(job({ revisionsUsed: 1 })), false);
  assert.equal(canRevise(job({ status: "queued" })), false);
});
