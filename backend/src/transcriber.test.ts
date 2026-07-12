import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDeepgram } from "./transcriber.js";

test("parseDeepgram maps words, speakers, and language", () => {
  const transcript = parseDeepgram({
    metadata: { duration: 12.5 },
    results: {
      channels: [
        {
          detected_language: "en",
          alternatives: [
            {
              words: [
                { word: "hello", punctuated_word: "Hello,", start: 0, end: 0.5, speaker: 0 },
                { word: "world", punctuated_word: "world.", start: 0.6, end: 1.0, speaker: 1 },
              ],
            },
          ],
        },
      ],
    },
  });
  assert.equal(transcript.words.length, 2);
  assert.equal(transcript.words[0]?.word, "Hello,");
  assert.equal(transcript.text, "Hello, world.");
  assert.equal(transcript.language, "en");
  assert.equal(transcript.durationSec, 13);
  assert.equal(transcript.speakerCount, 2);
});

test("parseDeepgram handles an empty response", () => {
  const transcript = parseDeepgram({});
  assert.equal(transcript.words.length, 0);
  assert.equal(transcript.speakerCount, 1);
  assert.equal(transcript.language, "en");
});
