import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

describe("M2b re-employment queue", () => {
  it("re-hires at least one queued worker by day 120 with D=90 and open slots", () => {
    const { dailyMetrics } = runM2aSimulation({
      seed: 42,
      days: 120,
      abundance: 1,
      policyName: "Mix",
      m2bEnabled: true,
    });
    const lines = dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
    const last = lines[lines.length - 1];
    expect(last.queueHiresCumulative).toBeGreaterThanOrEqual(1);
    const anyHireBefore120 = lines.some((l) => (l.queueHiresCumulative ?? 0) > 0);
    expect(anyHireBefore120).toBe(true);
  });
});
