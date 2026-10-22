import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

function lastLine(seed: number, days: number, abundance: number, m2bEnabled: boolean) {
  const { dailyMetrics } = runM2aSimulation({
    seed,
    days,
    abundance,
    policyName: "Mix",
    m2bEnabled,
  });
  return JSON.parse(dailyMetrics.at(-1)!) as DailyMetricLine;
}

describe("M2b labor mechanics", () => {
  it("displaced at a=1 with queue is at most M2a displaced", () => {
    const m2a = lastLine(42, 60, 1, false);
    const m2b = lastLine(42, 60, 1, true);
    expect(m2b.displaced).toBeLessThanOrEqual(m2a.displaced);
  });

  it("quantity-priced needs fall with abundance under M2b", () => {
    const a0 = lastLine(42, 60, 0, true);
    const a1 = lastLine(42, 60, 1, true);
    expect(a1.priceIndex).toBeLessThan(a0.priceIndex);
    expect(a0.costPerPerson).toBeGreaterThan(a1.costPerPerson);
  });
});
