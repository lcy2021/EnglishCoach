import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { achievements, goalProgress, weekCompare } from "./goals.ts";

describe("goals", () => {
  it("caps progress at 100% and survives a zero goal", () => {
    assert.equal(goalProgress(2, 4), 0.5);
    assert.equal(goalProgress(9, 3), 1);
    assert.equal(goalProgress(1, 0), 0);
  });

  it("unlocks achievements from records and clamps progress", () => {
    const list = achievements({ drills: 12, perfect: 2, longestStreak: 3, bestDay: 4 });
    const by = Object.fromEntries(list.map((a) => [a.id, a]));
    assert.equal(by["first"].unlocked, true);
    assert.equal(by["ten"].unlocked, true);
    assert.equal(by["ten"].value, 10);
    assert.equal(by["fifty"].unlocked, false);
    assert.equal(by["fifty"].value, 12);
    assert.equal(by["streak-3"].unlocked, true);
    assert.equal(by["streak-7"].unlocked, false);
    assert.equal(by["big-day"].unlocked, false);
  });

  it("starts with nothing unlocked", () => {
    const list = achievements({ drills: 0, perfect: 0, longestStreak: 0, bestDay: 0 });
    assert.ok(list.every((a) => !a.unlocked));
  });

  it("compares this week with the one before", () => {
    const days = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-11-${String(i + 1).padStart(2, "0")}`,
      drills: i < 7 ? 1 : 2,
      perfect: i < 7 ? 0 : 1,
    }));
    const { thisWeek, lastWeek } = weekCompare(days);
    assert.equal(lastWeek.drills, 7);
    assert.equal(lastWeek.perfectRate, 0);
    assert.equal(thisWeek.drills, 14);
    assert.equal(thisWeek.perfectRate, 50);
    assert.equal(thisWeek.activeDays, 7);
  });

  it("reports no rate for an empty week", () => {
    const { thisWeek } = weekCompare([{ date: "2026-11-01", drills: 0, perfect: 0 }]);
    assert.equal(thisWeek.perfectRate, null);
  });
});
