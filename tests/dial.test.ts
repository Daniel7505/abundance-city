import { describe, expect, it } from "vitest";
import { runM1Simulation } from "../src/sim/m1/engine.js";
import type { DailyMetricLine } from "../src/sim/m1/metrics.js";

function lastDayMetrics(abundance: number): DailyMetricLine {
  const { dailyMetrics } = runM1Simulation({ seed: 42, days: 30, abundance });
  const last = dailyMetrics[dailyMetrics.length - 1];
  return JSON.parse(last) as DailyMetricLine;
}

describe("abundance dial direction", () => {
  it("a=1 vs a=0: fewer jobs, lower price, higher workOptionalShare, lower costPerPerson", () => {
    const low = lastDayMetrics(0);
    const high = lastDayMetrics(1);

    expect(high.jobs).toBeLessThan(low.jobs);
    expect(high.price).toBeLessThan(low.price);
    expect(high.workOptionalShare).toBeGreaterThan(low.workOptionalShare);
    expect(high.costPerPerson).toBeLessThan(low.costPerPerson);
  });
});
