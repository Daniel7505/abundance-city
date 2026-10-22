import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { targetMedianIncomeUsd } from "../src/sim/m2a/calibration.js";

function institutionalBalances(balances: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {
    treasury: balances.treasury ?? 0,
    landlord: balances.landlord ?? 0,
    producer: balances.producer ?? 0,
    firms: 0,
  };
  for (const [k, v] of Object.entries(balances)) {
    if (k.startsWith("firm:")) out.firms += v;
  }
  return out;
}

describe("M2a a=0 one-year steady state", () => {
  it("365d Mix: Gini band, median income, bounded institutional accounts", () => {
    const { dailyMetrics, summary } = runM2aSimulation({
      seed: 42,
      days: 365,
      abundance: 0,
      policyName: "Mix",
      m2bEnabled: false,
    });
    const parsed = dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
    const last = parsed[parsed.length - 1];

    expect(last.employed).toBe(202);
    expect(last.gini).toBeGreaterThanOrEqual(0.35);
    expect(last.gini).toBeLessThanOrEqual(0.39);

    const target = targetMedianIncomeUsd();
    expect(
      Math.abs(last.medianAnnualizedHouseholdIncomeUsd - target) / target,
    ).toBeLessThanOrEqual(0.05);

    const inst = institutionalBalances(summary.accountBalancesCents);
    expect(inst.landlord).toBe(0);
    expect(inst.treasury).toBe(0);
    expect(inst.producer).toBe(100_000);

    const day120 = JSON.parse(
      runM2aSimulation({ seed: 42, days: 120, abundance: 0, policyName: "Mix" }).dailyMetrics[119],
    ) as DailyMetricLine;
    const inst120 = institutionalBalances(
      runM2aSimulation({ seed: 42, days: 120, abundance: 0, policyName: "Mix" }).summary
        .accountBalancesCents,
    );
    expect(inst.firms).toBeLessThanOrEqual(inst120.firms * 1.001 + 1);
    expect(Math.abs(last.gini - day120.gini)).toBeLessThanOrEqual(0.03);
  });
});
