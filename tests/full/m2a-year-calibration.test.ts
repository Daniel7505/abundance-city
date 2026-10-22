import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../../src/sim/m2a/engine.js";
import { buildM2aWorld } from "../../src/sim/m2a/worldgen.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";
import {
  calibrationSnapshot,
  targetGini,
  targetMedianIncomeUsd,
} from "../../src/sim/m2a/calibration.js";

function parseRun(days: number) {
  const { dailyMetrics, summary } = runM2aSimulation({
    seed: 42,
    days,
    abundance: 0,
    policyName: "Mix",
    m2bEnabled: true,
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
    expect(Math.abs(last.giniFactor - targetGini())).toBeLessThanOrEqual(0.05);
    expect(last.giniDisposable).toBeGreaterThan(0);
    expect(Math.abs(last.giniDisposable - targetGini())).toBeLessThanOrEqual(0.05);

    const acsMedian = calibrationSnapshot(buildM2aWorld(42)).medianHouseholdIncomeUsd;
    const target = targetMedianIncomeUsd();
    expect(Math.abs(acsMedian - target) / target).toBeLessThanOrEqual(0.05);

    expect(summary.accountBalancesCents.landlord).toBe(0);
    expect(summary.accountBalancesCents.treasury).toBe(0);
    expect(summary.accountBalancesCents.producer).toBe(100_000);

    const firmBaseSum = (lines[29].firmBalancesCents ?? []).reduce((s, v) => s + v, 0);
    for (const line of stable) {
      const firmSum = (line.firmBalancesCents ?? []).reduce((s, v) => s + v, 0);
      expect(firmSum).toBeGreaterThanOrEqual(firmBaseSum * 0.45);
      expect(firmSum).toBeLessThanOrEqual(firmBaseSum * 1.5);
    }

    const agentCashSeries = lines.map((l) => l.agentCashCentsTotal ?? 0);
    const firstCash = agentCashSeries[0];
    const finalCash = agentCashSeries.at(-1)!;
    const stableCash = agentCashSeries.slice(-30);
    const meanCash = stableCash.reduce((s, v) => s + v, 0) / stableCash.length;
    const maxCashDev = Math.max(...stableCash.map((v) => Math.abs(v - meanCash)));
    expect(maxCashDev / meanCash).toBeLessThanOrEqual(0.05);
  });
});
