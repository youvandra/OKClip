import assert from "node:assert/strict";
import { test } from "node:test";
import { isExpired, resolveClipPath } from "./storage.js";

test("isExpired compares age against TTL", () => {
  assert.equal(isExpired(0, 1000, 500), true);
  assert.equal(isExpired(600, 1000, 500), false);
});

test("resolveClipPath allows a normal filename", () => {
  const p = resolveClipPath("job123", "dQw4w9WgXcQ_1_0s.mp4");
  assert.ok(p);
  assert.match(p!, /job123\/dQw4w9WgXcQ_1_0s\.mp4$/);
});

test("resolveClipPath rejects traversal attempts", () => {
  assert.equal(resolveClipPath("job123", "../secret"), undefined);
  assert.equal(resolveClipPath("job123", "/etc/passwd"), undefined);
  assert.equal(resolveClipPath("../evil", "clip.mp4"), undefined);
  assert.equal(resolveClipPath("job/../..", "clip.mp4"), undefined);
});
