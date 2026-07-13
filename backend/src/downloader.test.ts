import assert from "node:assert/strict";
import { test } from "node:test";
import { DownloadError, probe } from "./downloader.js";

test("probe returns normalized metadata from a YouTube URL", async () => {
  const meta = await probe("https://www.youtube.com/watch?v=spBvft9lG1M");
  assert.equal(meta.id, "spBvft9lG1M");
  assert.ok(meta.title.length > 0);
});

test("probe handles short URLs", async () => {
  const meta = await probe("https://youtu.be/dQw4w9WgXcQ");
  assert.equal(meta.id, "dQw4w9WgXcQ");
});

test("DownloadError preserves reason", () => {
  const err = new DownloadError("test", "unavailable");
  assert.equal(err.reason, "unavailable");
  assert.equal(err.name, "DownloadError");
});
