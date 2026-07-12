import assert from "node:assert/strict";
import { test } from "node:test";
import { JobQueue } from "./queue.js";
import type { Brief, NegotiatedTerms } from "./types.js";

const brief: Brief = {
  url: "https://youtu.be/example",
  prompt: "3 best moments",
  clipCount: 3,
};

const terms: NegotiatedTerms = {
  clipCount: 3,
  aspectRatio: "9:16",
  maxClipSeconds: 30,
  priceUsdt: "1",
  revisionRounds: 1,
};

/** Wait until a predicate holds or a timeout elapses. */
async function waitFor(fn: () => boolean, ms = 1000): Promise<void> {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
}

test("enqueue creates a tracked job with an id", () => {
  const q = new JobQueue(async () => {});
  const job = q.enqueue("agent-1", brief, terms);
  assert.ok(job.id);
  assert.equal(job.agentId, "agent-1");
  assert.equal(q.get(job.id)?.brief.clipCount, 3);
});

test("processor runs and marks the job done", async () => {
  const q = new JobQueue(async (job) => {
    q.setStatus(job.id, "done", { output: [] });
  });
  const job = q.enqueue("agent-1", brief, terms);
  await waitFor(() => q.get(job.id)?.status === "done");
  assert.equal(q.get(job.id)?.status, "done");
});

test("a throwing processor marks the job failed", async () => {
  const q = new JobQueue(async () => {
    throw new Error("boom");
  });
  const job = q.enqueue("agent-1", brief, terms);
  await waitFor(() => q.get(job.id)?.status === "failed");
  const failed = q.get(job.id);
  assert.equal(failed?.status, "failed");
  assert.equal(failed?.error, "boom");
});

test("jobs drain sequentially, preserving order", async () => {
  const order: string[] = [];
  const q = new JobQueue(async (job) => {
    await new Promise((r) => setTimeout(r, 10));
    order.push(job.brief.prompt);
    q.setStatus(job.id, "done");
  });
  q.enqueue("a", { ...brief, prompt: "first" }, terms);
  q.enqueue("a", { ...brief, prompt: "second" }, terms);
  await waitFor(() => order.length === 2, 2000);
  assert.deepEqual(order, ["first", "second"]);
});
