import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyError, parseMeta } from "./downloader.js";

test("parseMeta normalizes yt-dlp json", () => {
  const meta = parseMeta(
    JSON.stringify({
      id: "abc123",
      title: "My Video",
      duration: 642.7,
      uploader: "Someone",
    }),
  );
  assert.equal(meta.id, "abc123");
  assert.equal(meta.title, "My Video");
  assert.equal(meta.durationSec, 643);
  assert.equal(meta.uploader, "Someone");
});

test("parseMeta tolerates missing fields", () => {
  const meta = parseMeta("{}");
  assert.equal(meta.id, "unknown");
  assert.equal(meta.durationSec, 0);
});

test("classifyError maps known yt-dlp failures", () => {
  assert.equal(classifyError("ERROR: Private video. Sign in"), "private");
  assert.equal(
    classifyError("Sign in to confirm your age"),
    "age_restricted",
  );
  assert.equal(classifyError("ERROR: Video unavailable"), "unavailable");
  assert.equal(classifyError("Unsupported URL: foo"), "unsupported");
  assert.equal(classifyError("something else entirely"), "unknown");
});
