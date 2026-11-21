import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveExplainRange } from "./article.ts";

describe("resolveExplainRange", () => {
  it("defaults to the whole article when no range is given", () => {
    assert.deepEqual(resolveExplainRange(5), { from: 0, to: 4 });
    assert.deepEqual(resolveExplainRange(5, {}), { from: 0, to: 4 });
  });

  it("treats a single bound as that paragraph only", () => {
    assert.deepEqual(resolveExplainRange(5, { from: 1 }), { from: 1, to: 1 });
    assert.deepEqual(resolveExplainRange(5, { to: 2 }), { from: 2, to: 2 });
  });

  it("keeps an explicit inclusive range", () => {
    assert.deepEqual(resolveExplainRange(5, { from: 1, to: 3 }), { from: 1, to: 3 });
    assert.deepEqual(resolveExplainRange(5, { from: 3, to: 1 }), { from: 1, to: 3 });
  });

  it("clamps to article bounds", () => {
    assert.deepEqual(resolveExplainRange(5, { from: -2, to: 99 }), { from: 0, to: 4 });
  });
});
