import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { calibrationSnapshot, targetMedianIncomeUsd } from "../src/sim/m2a/calibration.js";

function parseRun(days: number) {
  const { dailyMetrics, summary } = runM2aSimulation({
    seed: 42,
    days,
    abundance: 0,
    policyName: "Mix",
    m2bEnabled: false,
  });
  return {
    lines: dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine),
    summary,
  };
}

describe("M2a a=0 one-year steady state", () => {
  it("365d Mix: Gini band, ACS median, firm and household cash bounded", () => {
    const { lines, summary } = parseRun(365);
    const last = lines[lines.length - 1];
    const day0 = lines[0];
    const stable = lines.slice(-30);

    expect(last.employed).toBe(202);

    for (const line of lines) {
      expect(line.wageGapCents ?? 0).toBe(0);
    }
    for (const line of stable) {
      const wages = line.byIndustry.reduce((s, r) => s + r.wages, 0);
      expect(wages).toBe(line.payrollCents);
    }
    expect(last.gini).toBeGreaterThanOrEqual(0.34);
    expect(last.gini).toBeLessThanOrEqual(0.39);

    const acsMedian = calibrationSnapshot(buildM2aWorld(42)).medianHouseholdIncomeUsd;
    const target = targetMedianIncomeUsd();
    expect(Math.abs(acsMedian - target) / target).toBeLessThanOrEqual(0.05);

    expect(summary.accountBalancesCents.landlord).toBe(0);
    expect(summary.accountBalancesCents.treasury).toBe(0);
    expect(summary.accountBalancesCents.producer).toBe(100_000);

    const day0Firms = day0.firmBalancesCents ?? [];
    for (const line of lines) {
      const firms = line.firmBalancesCents ?? [];
      for (let i = 0; i < firms.length; i++) {
        const base = day0Firms[i];
        expect(firms[i]).toBeGreaterThanOrEqual(base * 0.5);
        expect(firms[i]).toBeLessThanOrEqual(base * 1.5);
      }
    }

    const agentCashSeries = lines.map((l) => l.agentCashCentsTotal ?? 0);
    const firstCash = agentCashSeries[0];
    const finalCash = agentCashSeries.at(-1)!;
    const maxDrift = Math.max(...agentCashSeries.map((v) => Math.abs(v - firstCash)));
    expect(maxDrift / firstCash).toBeLessThanOrEqual(0.05);
    const trendingUp =
      finalCash > firstCash * 1.02 &&
      agentCashSeries.every((v, i) => i === 0 || v >= agentCashSeries[i - 1] - 1);
    const trendingDown =
      finalCash < firstCash * 0.98 &&
      agentCashSeries.every((v, i) => i === 0 || v <= agentCashSeries[i - 1] + 1);
    expect(trendingUp || trendingDown).toBe(false);
  });
});
