import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExplainPayload } from "./parse.ts";
import { linesFromParagraph, splitEnglishSentences } from "./sentences.ts";

describe("parseExplainPayload", () => {
  it("stores Chinese only and keeps English from the source paragraph", () => {
    const english = "She opened the window. Cold air filled the room.";
    const raw = [
      "```json",
      JSON.stringify({
        sentences: [
          { en: "She opened the window.", zh: "她打开了窗户。" },
          { en: "Cold air filled the room.", zh: "冷空气充满了房间。" },
        ],
        phrases: [
          { text: "a lot of", gloss: "许多", sentence: "a lot of attention" },
          { text: "in spite of", gloss: "尽管", sentence: "" },
          { text: "look up", gloss: "查阅", sentence: "" },
          { text: "according to", gloss: "根据", sentence: "" },
          { text: "extra", gloss: "多余", sentence: "" },
        ],
        words: [{ text: "attention", gloss: "注意" }],
      }),
      "```",
    ].join("\n");
    const parsed = parseExplainPayload(raw, english);
    assert.equal(parsed.phrases.length, 4);
    const stored = JSON.parse(parsed.zh) as { v: number; zh: string[] };
    assert.equal(stored.v, 1);
    assert.deepEqual(stored.zh, ["她打开了窗户。", "冷空气充满了房间。"]);

    const lines = linesFromParagraph(english, parsed.zh);
    assert.equal(lines[0]?.en, "She opened the window.");
    assert.equal(lines[0]?.zh, "她打开了窗户。");
    assert.equal(lines[1]?.en, "Cold air filled the room.");
  });

  it("rejects a reply that has no Chinese sentence", () => {
    assert.throws(() => parseExplainPayload('{"phrases":[]}', "Hello."), /没有写出中文/);
    assert.throws(() => parseExplainPayload("not json", "Hello."), /没有返回可用的内容/);
  });
});

describe("linesFromParagraph", () => {
  it("keeps English lines before Chinese arrives", () => {
    const lines = linesFromParagraph("One. Two.", null);
    assert.deepEqual(
      lines.map((line) => line.en),
      ["One.", "Two."],
    );
    assert.equal(lines.every((line) => line.zh === null), true);
  });
});

describe("splitEnglishSentences", () => {
  it("keeps terminal punctuation with each sentence", () => {
    const parts = splitEnglishSentences("One. Two? Three!");
    assert.deepEqual(parts, ["One.", "Two?", "Three!"]);
  });
});
