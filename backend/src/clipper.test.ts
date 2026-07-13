import assert from "node:assert/strict";
import { test } from "node:test";
import { aspectFilter, buildClipArgs } from "./clipper.js";

test("aspectFilter returns a center crop for vertical/square, none for 16:9", () => {
  assert.match(aspectFilter("9:16") ?? "", /crop=ih\*9\/16/);
  assert.match(aspectFilter("1:1") ?? "", /crop=ih:ih/);
  assert.equal(aspectFilter("16:9"), null);
});

test("buildClipArgs seeks, sets duration, and encodes", () => {
  const args = buildClipArgs({
    input: "in.mp4",
    output: "out.mp4",
    startSec: 4.5,
    endSec: 9.0,
    aspectRatio: "16:9",
  });
  const joined = args.join(" ");
  assert.match(joined, /-i in\.mp4/);
  assert.match(joined, /-ss 4\.500/);
  assert.match(joined, /libx264/);
  assert.match(joined, /-crf 18/);
  assert.match(joined, /yuv420p/);
  assert.match(joined, /-b:a 192k/);
  assert.match(joined, /loudnorm/);
  assert.equal(args[args.length - 1], "out.mp4");
  assert.ok(!joined.includes("-vf"));
});

test("buildClipArgs adds a crop filter for 9:16", () => {
  const args = buildClipArgs({
    input: "in.mp4",
    output: "out.mp4",
    startSec: 0,
    endSec: 5,
    aspectRatio: "9:16",
  });
  assert.ok(args.includes("-vf"));
});

test("buildClipArgs chains crop and subtitle burn", () => {
  const args = buildClipArgs({
    input: "in.mp4",
    output: "out.mp4",
    startSec: 0,
    endSec: 5,
    aspectRatio: "9:16",
    subtitleFile: "clip.srt",
  });
  const vf = args[args.indexOf("-vf") + 1]!;
  assert.match(vf, /crop=/);
  assert.match(vf, /subtitles='clip\.srt':original_size=1/);
  assert.ok(vf.includes(","));
});

test("buildClipArgs burns subtitles even without a crop (16:9)", () => {
  const args = buildClipArgs({
    input: "in.mp4",
    output: "out.mp4",
    startSec: 0,
    endSec: 5,
    aspectRatio: "16:9",
    subtitleFile: "clip.srt",
  });
  const vf = args[args.indexOf("-vf") + 1]!;
  assert.match(vf, /subtitles='clip\.srt':original_size=1/);
});
