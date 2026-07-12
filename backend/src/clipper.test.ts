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
  assert.match(joined, /-ss 4\.500/);
  assert.match(joined, /-t 4\.500/); // duration = end - start
  assert.match(joined, /-i in\.mp4/);
  assert.match(joined, /libx264/);
  assert.equal(args[args.length - 1], "out.mp4");
  assert.ok(!joined.includes("-vf")); // 16:9 has no crop filter
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
