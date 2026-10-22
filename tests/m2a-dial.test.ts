import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

function lastLine(seed: number, abundance: number): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({ seed, days: 30, abundance });
  return JSON.parse(dailyMetrics[dailyMetrics.length - 1]) as DailyMetricLine;
}

describe("M2a abundance dial (directional)", () => {
  it("labor falls and displaced rises as abundance increases", () => {
    const a0 = lastLine(42, 0);
    const a05 = lastLine(42, 0.5);
    const a1 = lastLine(42, 1);
    expect(a05.totalLaborHours).toBeLessThanOrEqual(a0.totalLaborHours);
    expect(a1.totalLaborHours).toBeLessThanOrEqual(a05.totalLaborHours);
    expect(a1.displaced).toBeGreaterThanOrEqual(a0.displaced);
  });

  it("workOptionalShare rises from a=0 to a=1 (directional)", () => {
    const s0 = lastLine(42, 0).workOptionalShare;
    const s1 = lastLine(42, 1).workOptionalShare;
    expect(s1).toBeGreaterThanOrEqual(s0);
  });
});
