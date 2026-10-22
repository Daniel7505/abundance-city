import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { targetAgentCount } from "../src/sim/m2a/calibration.js";

function parseLines(days: number, abundance: number): DailyMetricLine[] {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days,
    abundance,
    policyName: "Mix",
    m2bEnabled: true,
  });
  return dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
}

describe("M2b labor accounting", () => {
  it("partition invariant holds every day", () => {
    const lines = parseLines(120, 1);
    const n = targetAgentCount();
    for (const line of lines) {
      const p = line.laborPartition;
      expect(p).toBeDefined();
      const sum = p!.employed + p!.queued + p!.retired + p!.displacedUnqueued + p!.nlf;
      expect(sum).toBe(n);
    }
  });

  it("demand-slot hires raise employed above baseline-only headcount at a=1", () => {
    const last = parseLines(365, 1).at(-1)!;
    expect(last.queueHiresCumulative).toBeGreaterThan(0);
    expect(last.employed).toBeGreaterThan(135);
  });

  it("workOptionalShare rises with abundance under quantity needs", () => {
    const a03 = parseLines(365, 0.3).at(-1)!.workOptionalShare;
    const a10 = parseLines(365, 1).at(-1)!.workOptionalShare;
    expect(a10).toBeGreaterThan(a03);
  });
});
