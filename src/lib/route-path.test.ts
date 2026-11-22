import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathFromRoute, routeFromPath } from "./route-path.ts";

describe("route paths", () => {
  it("keeps article reading at the root", () => {
    assert.equal(pathFromRoute("practice"), "/");
    assert.equal(routeFromPath("/"), "practice");
    assert.equal(routeFromPath(""), "practice");
  });

  it("round-trips every other page", () => {
    for (const route of ["drill", "converse", "wrong-book", "library", "drill-bank", "vocab", "stats", "settings"] as const) {
      assert.equal(routeFromPath(pathFromRoute(route)), route);
    }
  });

  it("ignores a trailing slash and falls back when the path is unknown", () => {
    assert.equal(routeFromPath("/stats/"), "stats");
    assert.equal(routeFromPath("/missing"), "practice");
  });
});
