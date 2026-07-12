import assert from "node:assert/strict";
import { test } from "node:test";
import { buildThumbnailArgs } from "./thumbnail.js";

test("buildThumbnailArgs seeks and grabs one frame", () => {
  const args = buildThumbnailArgs({
    input: "in.mp4",
    output: "thumb.jpg",
    atSec: 12.34,
  });
  const joined = args.join(" ");
  assert.match(joined, /-ss 12\.340/);
  assert.match(joined, /-frames:v 1/);
  assert.equal(args[args.length - 1], "thumb.jpg");
});
