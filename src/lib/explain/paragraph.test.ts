import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseExplainPayload } from "./parse.ts";

describe("parseExplainPayload", () => {
  it("reads a fenced reply and caps notes", () => {
    const raw = [
      "```json",
      JSON.stringify({
        zh: "这是一段通顺的中文。",
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
    const parsed = parseExplainPayload(raw);
    assert.equal(parsed.zh, "这是一段通顺的中文。");
    assert.equal(parsed.phrases.length, 4);
    assert.equal(parsed.phrases[0]?.text, "a lot of");
    assert.equal(parsed.words.length, 1);
    assert.equal(parsed.words[0]?.sentence, "");
  });

  it("rejects a reply that has no Chinese sentence", () => {
    assert.throws(() => parseExplainPayload('{"phrases":[]}'), /没有写出中文/);
    assert.throws(() => parseExplainPayload("not json"), /没有返回可用的内容/);
  });
});
