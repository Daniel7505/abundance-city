import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

function lastShare(abundance: number): number {
  const { dailyMetrics } = runM2aSimulation({ seed: 42, days: 30, abundance });
  const last = JSON.parse(dailyMetrics[dailyMetrics.length - 1]) as DailyMetricLine;
  return last.workOptionalShare;
}

describe("M2a abundance dial", () => {
  it("workOptionalShare is non-binary across dial and non-decreasing in a", () => {
    const shares: number[] = [];
    for (let step = 0; step <= 10; step++) {
      const a = step / 10;
      shares.push(lastShare(a));
    }
    const interior = shares.filter((s) => s > 0.05 && s < 0.95);
    expect(interior.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1]);
    }
  });
});
