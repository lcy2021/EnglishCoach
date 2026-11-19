import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BOX_DAYS, TOP_BOX, formatInterval, schedule, stageOf } from "./srs.ts";

const DAY = 86_400_000;

describe("schedule", () => {
  it("sends a forgotten word back to box 0 and asks again in 10 minutes", () => {
    const result = schedule(4, "again");
    assert.equal(result.box, 0);
    assert.equal(result.dueInMs, 10 * 60_000);
  });

  it("moves a remembered word up one box and waits that box's days", () => {
    const result = schedule(2, "good");
    assert.equal(result.box, 3);
    assert.equal(result.dueInMs, BOX_DAYS[3] * DAY);
  });

  it("never climbs past the top box", () => {
    assert.equal(schedule(TOP_BOX, "good").box, TOP_BOX);
    assert.equal(schedule(99, "good").box, TOP_BOX);
  });

  it("keeps a hesitant word in place but never schedules it sooner than a day", () => {
    const fresh = schedule(0, "hard");
    assert.equal(fresh.box, 1);
    assert.ok(fresh.dueInMs >= DAY);
    const mid = schedule(4, "hard");
    assert.equal(mid.box, 4);
    assert.ok(mid.dueInMs < BOX_DAYS[4] * DAY);
  });

  it("waits longer the better you know it", () => {
    let box = 0;
    let last = 0;
    for (let i = 0; i < TOP_BOX; i += 1) {
      const next = schedule(box, "good");
      assert.ok(next.dueInMs > last);
      last = next.dueInMs;
      box = next.box;
    }
  });
});

describe("formatInterval / stageOf", () => {
  it("formats minutes, hours and days", () => {
    assert.equal(formatInterval(10 * 60_000), "10 分钟后");
    assert.equal(formatInterval(3 * 3_600_000), "3 小时后");
    assert.equal(formatInterval(2 * DAY), "2 天后");
    assert.equal(formatInterval(60 * DAY), "2 个月后");
  });

  it("labels the learning stage", () => {
    assert.equal(stageOf(0), "new");
    assert.equal(stageOf(2), "learning");
    assert.equal(stageOf(5), "mastered");
  });
});
