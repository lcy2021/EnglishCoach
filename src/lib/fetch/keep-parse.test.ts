import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseKeepIndexes } from "./keep-parse.ts";

describe("parseKeepIndexes", () => {
  it("expands inclusive ranges", () => {
    assert.deepEqual(parseKeepIndexes('{"ranges":[[2,4],[7,7]]}', 10), [2, 3, 4, 7]);
  });
  it("tolerates code fences and clamps to the block count", () => {
    assert.deepEqual(parseKeepIndexes('```json\n{"ranges":[[-3,1],[8,99]]}\n```', 10), [0, 1, 8, 9]);
  });
  it("ignores malformed ranges", () => {
    assert.deepEqual(parseKeepIndexes('{"ranges":[5,[1.5,3],["2",4],[1,2]]}', 10), [1, 2]);
  });
  it("returns null for junk or empty answers", () => {
    assert.equal(parseKeepIndexes("sorry", 5), null);
    assert.equal(parseKeepIndexes('{"ranges":[]}', 5), null);
    assert.equal(parseKeepIndexes('{"keep":[1,2]}', 5), null);
  });
});
