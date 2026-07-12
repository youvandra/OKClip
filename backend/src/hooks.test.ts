import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSceneTimes, refineStart } from "./hooks.js";

test("parseSceneTimes extracts sorted pts_time values", () => {
  const stderr =
    "frame showinfo pts_time:5.5 ...\n more pts_time:1.25 ...\n pts_time:12.0";
  assert.deepEqual(parseSceneTimes(stderr), [1.25, 5.5, 12.0]);
});

test("parseSceneTimes returns empty when none present", () => {
  assert.deepEqual(parseSceneTimes("nothing here"), []);
});

test("refineStart snaps to the latest cut within the window", () => {
  const scenes = [3.0, 9.6, 20.0];
  assert.equal(refineStart(10, scenes, 2), 9.6); // 9.6 is within 2s before 10
  assert.equal(refineStart(10, scenes, 0.1), 10); // no cut close enough
  assert.equal(refineStart(10, [], 2), 10); // no scenes
});
