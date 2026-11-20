import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatOpenParagraph } from "./paragraph-context.ts";

const long =
  "Researchers recorded from hundreds of neurons while animals watched moving patterns, and they found that a simple weighting rule explained most of the activity they saw across the session.";

describe("formatOpenParagraph", () => {
  it("includes the whole paragraph with no character cap", () => {
    const note = formatOpenParagraph(
      {
        title: "Vision",
        paragraphs: [
          { index: 0, text: "Short." },
          { index: 1, text: long },
        ],
      },
      1,
    );
    assert.match(note, /Paragraph 2:/);
    assert.ok(note.endsWith(long));
    assert.equal(note.includes(long.slice(0, 160)) && note.includes(long.slice(160)), true);
  });

  it("is empty when no paragraph is selected", () => {
    assert.equal(
      formatOpenParagraph({ title: "Vision", paragraphs: [{ index: 0, text: long }] }, null),
      "",
    );
    assert.equal(formatOpenParagraph(null, 0), "");
  });
});
