import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  gradeLocally,
  gradeSummary,
  mergeGrades,
  parseDrillGrade,
  parseDrillPrompt,
} from "./parse.ts";

describe("parseDrillPrompt", () => {
  it("reads a fenced prompt and drops empty words", () => {
    const parsed = parseDrillPrompt(
      '```json\n{"zh":"我昨天在公园遇见了一位老朋友。","words":["I","met","an","old","friend","yesterday"],"end":"!"}\n```',
    );
    assert.equal(parsed.zh, "我昨天在公园遇见了一位老朋友。");
    assert.deepEqual(parsed.words, ["I", "met", "an", "old", "friend", "yesterday"]);
    assert.equal(parsed.end, "!");
  });

  it("rejects a reply that is too short to place underlines", () => {
    assert.throws(() => parseDrillPrompt('{"zh":"你好。","words":["Hi"]}'), /词数不合适/);
  });
});

describe("gradeLocally", () => {
  it("ignores case and edge punctuation", () => {
    const slots = gradeLocally(
      ["I", "don't", "know"],
      ["i", "Don’t", "know."],
    );
    assert.deepEqual(
      slots.map((slot) => slot.status),
      ["correct", "correct", "correct"],
    );
  });

  it("marks a missing or different word wrong", () => {
    const slots = gradeLocally(["met", "an", "old", "friend"], ["saw", "an", "", "friends"]);
    assert.deepEqual(
      slots.map((slot) => slot.status),
      ["wrong", "correct", "wrong", "wrong"],
    );
  });
});

describe("mergeGrades", () => {
  it("keeps an exact match and accepts a synonym the model allows", () => {
    const local = gradeLocally(["met", "friend"], ["saw", "friend"]);
    const model = parseDrillGrade(
      '{"slots":[{"status":"close"},{"status":"wrong"}],"summary":"saw 也可以，更贴的是 met。"}',
      ["met", "friend"],
    );
    const merged = mergeGrades(local, model?.slots ?? null);
    assert.deepEqual(
      merged.map((slot) => slot.status),
      ["close", "correct"],
    );
    assert.equal(gradeSummary(merged, "saw 也可以，更贴的是 met。"), "saw 也可以，更贴的是 met。");
  });
});
