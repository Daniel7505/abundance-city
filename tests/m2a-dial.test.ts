import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

function lastShare(abundance: number): number {
  const { dailyMetrics } = runM2aSimulation({ seed: 42, days: 30, abundance });
  const last = JSON.parse(dailyMetrics[dailyMetrics.length - 1]) as DailyMetricLine;
  return last.workOptionalShare;
}

describe("M2a abundance dial", () => {
  it("workOptionalShare is non-binary across dial and rises meaningfully with a", () => {
    const shares: number[] = [];
    for (let step = 0; step <= 10; step++) {
      const a = step / 10;
      shares.push(lastShare(a));
    }
    const interior = shares.filter((s) => s > 0.05 && s < 0.95);
    expect(interior.length).toBeGreaterThanOrEqual(3);
    expect(shares[shares.length - 1] - shares[0]).toBeGreaterThanOrEqual(0.3);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeGreaterThanOrEqual(shares[i - 1]);
    }
    for (let i = 1; i < shares.length - 1; i++) {
      expect(shares[i] - shares[i - 1]).toBeLessThanOrEqual(0.3);
    }
    expect(shares[shares.length - 1] - shares[shares.length - 2]).toBeLessThanOrEqual(
      0.45,
    );
  });
});
