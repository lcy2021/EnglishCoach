import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clampPage, readPage } from "./page.ts";

describe("clampPage", () => {
  it("keeps the first page inside a short list", () => {
    assert.deepEqual(clampPage(1, 7, 3), { page: 1, pageSize: 7, offset: 0 });
  });

  it("moves a page past the end back to the last page", () => {
    assert.deepEqual(clampPage(9, 7, 15), { page: 3, pageSize: 7, offset: 14 });
  });

  it("rejects a zero page and an oversized page size", () => {
    assert.deepEqual(clampPage(0, 500, 10), { page: 1, pageSize: 50, offset: 0 });
    assert.equal(readPage(null, 2), 2);
    assert.equal(readPage("4", 1), 4);
    assert.equal(readPage("nope", 1), 1);
  });
});
