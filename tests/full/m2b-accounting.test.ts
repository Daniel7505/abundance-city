import { beforeAll, describe, expect, it } from "vitest";
import { runM2aSimulation } from "../../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";
import { targetAgentCount } from "../../src/sim/m2a/calibration.js";

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
  let lines120: DailyMetricLine[] = [];
  let lines365a1: DailyMetricLine[] = [];
  let lines365a03: DailyMetricLine[] = [];

  beforeAll(() => {
    lines120 = parseLines(120, 1);
    lines365a1 = parseLines(365, 1);
    lines365a03 = parseLines(365, 0.3);
  });

  it("partition invariant holds every day", () => {
    const n = targetAgentCount();
    expect(n).toBe(379);
    for (const line of lines120) {
      const p = line.laborPartition;
      expect(p).toBeDefined();
      const sum = p!.employed + p!.queued + p!.retired + p!.displacedUnqueued + p!.nlf;
      expect(sum).toBe(n);
    }
  });

  it("demand-slot hires raise employed above baseline-only headcount at a=1", () => {
    const last = lines365a1.at(-1)!;
    expect(last.queueHiresCumulative).toBeGreaterThan(0);
    expect(last.employed).toBeGreaterThan(135);
  });

  it("workOptionalShare rises with abundance under quantity needs", () => {
    const a03 = lines365a03.at(-1)!.workOptionalShare;
    const a10 = lines365a1.at(-1)!.workOptionalShare;
    expect(a10).toBeGreaterThan(a03);
  });
});
