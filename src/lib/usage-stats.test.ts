import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildStats } from "./usage-stats.ts";

const now = new Date(2026, 10, 20, 12, 0, 0);
const today = new Date(2026, 10, 20, 9, 0, 0).toISOString();
const older = new Date(2026, 9, 1, 9, 0, 0).toISOString();

const usage = [
  { ts: today, source: "chat", input: 7425, output: 85 },
  { ts: older, source: "generate-explain", input: 100000, output: 59576 },
];
const drills = [
  { createdAt: today, gradesJson: JSON.stringify([{ status: "correct" }]) },
  { createdAt: older, gradesJson: JSON.stringify([{ status: "wrong" }]) },
];

describe("buildStats", () => {
  it("keeps a 30-day window inside that window and still counts all-time tokens", () => {
    const stats = buildStats(usage, drills, 30, now);
    assert.equal(stats.today.input + stats.today.output, 7510);
    assert.equal(stats.window.input + stats.window.output, 7510);
    assert.equal(stats.window.drills, 1);
    assert.equal(stats.allTime.tokens, 167086);
    assert.equal(stats.allTime.drills, 2);
    assert.equal(stats.days.length, 30);
    assert.deepEqual(
      stats.bySource.map((source) => source.source),
      ["chat"],
    );
  });

  it("makes the all-time window equal the cumulative token total", () => {
    const stats = buildStats(usage, drills, 0, now);
    assert.equal(stats.window.input + stats.window.output, stats.allTime.tokens);
    assert.equal(stats.window.input + stats.window.output, 167086);
    assert.equal(stats.window.input, 107425);
    assert.equal(stats.window.output, 59661);
    assert.equal(stats.window.drills, 2);
    assert.equal(stats.window.calls, 2);
    assert.equal(stats.days[0].date, "2026-10-01");
    assert.equal(stats.days[stats.days.length - 1].date, "2026-11-20");
    assert.equal(stats.bySource.length, 2);
  });
});
