import assert from "node:assert/strict";
import { test } from "node:test";
import { InMemoryEscrow } from "./escrow.js";

test("escrow funds then releases", async () => {
  const e = new InMemoryEscrow();
  await e.fund("j1", "a1", "1.50");
  assert.equal(e.get("j1")?.state, "funded");
  await e.release("j1");
  assert.equal(e.get("j1")?.state, "released");
});

test("escrow cannot release twice", async () => {
  const e = new InMemoryEscrow();
  await e.fund("j1", "a1", "1.00");
  await e.release("j1");
  await assert.rejects(() => e.release("j1"));
});

test("release without funding rejects", async () => {
  const e = new InMemoryEscrow();
  await assert.rejects(() => e.release("nope"));
});
