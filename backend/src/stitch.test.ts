import assert from "node:assert/strict";
import { test } from "node:test";
import { buildConcatList, buildStitchArgs } from "./stitch.js";

test("buildConcatList writes one ffmpeg concat line per file", () => {
  const list = buildConcatList(["a.mp4", "b.mp4"]);
  assert.equal(list, "file 'a.mp4'\nfile 'b.mp4'\n");
});

test("buildConcatList escapes single quotes", () => {
  const list = buildConcatList(["it's.mp4"]);
  assert.match(list, /it'\\''s\.mp4/);
});

test("buildStitchArgs uses the concat demuxer with stream copy", () => {
  const args = buildStitchArgs("list.txt", "reel.mp4");
  const joined = args.join(" ");
  assert.match(joined, /-f concat/);
  assert.match(joined, /-i list\.txt/);
  assert.match(joined, /-c copy/);
  assert.equal(args[args.length - 1], "reel.mp4");
});
