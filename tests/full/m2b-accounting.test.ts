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

  it("demand slots still rehire while MarketWages keeps employment under the automation cap", () => {
    const last = lines365a1.at(-1)!;
    expect(last.queueHiresCumulative).toBeGreaterThan(0);
    expect(last.humanWageClaimCents ?? 0).toBe(0);
    expect(last.wageGapCents).toBe(0);
    // 135 is the a=1 structural headcount before market layoffs. Human-variant
    // receipts do not cover that bill, so the firm cuts jobs instead of taking
    // a producer transfer, and employment finishes below the cap.
    expect(last.employed).toBeLessThan(135);
    expect(last.employed).toBeGreaterThan(0);
  });

  it("workOptionalShare rises with abundance under quantity needs", () => {
    const a03 = lines365a03.at(-1)!.workOptionalShare;
    const a10 = lines365a1.at(-1)!.workOptionalShare;
    expect(a10).toBeGreaterThan(a03);
  });
});
