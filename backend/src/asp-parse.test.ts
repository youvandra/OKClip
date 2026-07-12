import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alreadyDone,
  briefFromTask,
  clientOf,
  isOurs,
  isTerminalStatus,
  jobIdOf,
  statusOf,
} from "./asp-parse.js";

// The real shape returned by `onchainos agent active-tasks`. A designated task
// appears twice — once from each side. `statusCode` is numeric; `status` is text.
const aspRow = {
  counterpartyAgentId: "5211",
  counterpartyRole: "user",
  jobId: "0x1fc520753a1b39842fa899f6da5089a93c5f386e7da053e1295f943ada3e0edf",
  myAgentId: "5189",
  myRole: "asp",
  status: "created",
  statusCode: 0,
  title: "Clip 1 best moment",
  tokenAmount: "0.5",
  tokenSymbol: "USDT",
};
const userRow = {
  ...aspRow,
  counterpartyAgentId: "5189",
  counterpartyRole: "asp",
  myAgentId: "5211",
  myRole: "user",
};

test("statusOf reads numeric statusCode, not the text status (the bug)", () => {
  assert.equal(statusOf(aspRow), 0); // NOT NaN from "created"
  assert.equal(statusOf({ statusCode: 1 }), 1);
  assert.equal(statusOf({ statusCode: 3, status: "refused" }), 3);
});

test("isOurs matches the asp-perspective row for our agent", () => {
  assert.equal(isOurs(aspRow, "5189"), true);
  assert.equal(isOurs(userRow, "5189"), false); // our user-side duplicate
  assert.equal(isOurs(aspRow, "9999"), false); // someone else's agent
});

test("clientOf returns the counterparty (the paying client)", () => {
  assert.equal(clientOf(aspRow), "5211");
});

test("jobIdOf reads the jobId", () => {
  assert.equal(jobIdOf(aspRow), aspRow.jobId);
  assert.equal(jobIdOf({}), "");
});

test("isTerminalStatus is true only for >=5", () => {
  assert.equal(isTerminalStatus(4), false); // disputed is not terminal
  assert.equal(isTerminalStatus(5), true);
});

test("alreadyDone catches idempotent errors, not real broadcast failures", () => {
  assert.equal(alreadyDone(new Error("already applied")), true);
  assert.equal(alreadyDone(new Error("duplicate")), true);
  assert.equal(
    alreadyDone(new Error("broadcast failed: Wallet API error (code=4001)")),
    false,
  );
});

test("briefFromTask needs a URL — active-tasks rows have none", () => {
  // A bare active-tasks row (no serviceParams/description) cannot yield a brief.
  assert.throws(() => briefFromTask(aspRow));
  // With serviceParams it works.
  const brief = briefFromTask({
    ...aspRow,
    serviceParams: { url: "https://youtu.be/abc", clipCount: 2 },
  });
  assert.equal(brief.url, "https://youtu.be/abc");
  assert.equal(brief.clipCount, 2);
});
