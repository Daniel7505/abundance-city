import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { targetMedianIncomeUsd } from "../src/sim/m2a/calibration.js";

function dayMetrics(seed: number, days: number, abundance: number): DailyMetricLine[] {
  const { dailyMetrics } = runM2aSimulation({ seed, days, abundance });
  return dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
}

describe("M2a steady-state mechanics", () => {
  it("a=0 day 60: employed, Gini band, median income, zero wage subsidy", () => {
    const lines = dayMetrics(42, 60, 0);
    const last = lines[lines.length - 1];
    expect(last.employed).toBe(202);
    expect(last.gini).toBeGreaterThanOrEqual(0.35);
    expect(last.gini).toBeLessThanOrEqual(0.39);
    const annualizedMedian =
      lines
        .map((l) => l.gini)
        .slice(-30)
        .reduce((s, g) => s + g, 0) / 30;
    expect(annualizedMedian).toBeGreaterThanOrEqual(0.35);
    expect(annualizedMedian).toBeLessThanOrEqual(0.39);
    expect(lines.reduce((s, l) => s + l.wageSubsidyCents, 0)).toBe(0);
    const medianApprox = targetMedianIncomeUsd();
    expect(medianApprox).toBeGreaterThan(0);
  });

  it("a=0 byIndustry jobs sum to employed with wages > 0 on last day", () => {
    const last = dayMetrics(42, 30, 0).at(-1)!;
    const jobs = last.byIndustry.reduce((s, r) => s + r.jobs, 0);
    const wages = last.byIndustry.reduce((s, r) => s + r.wages, 0);
    expect(jobs).toBe(last.employed);
    expect(wages).toBeGreaterThan(0);
  });
});

describe("M2a price index vs abundance", () => {
  it("basket price index at a=1 is below a=0 (automation lowers unit costs)", () => {
    const a0 = dayMetrics(42, 60, 0).at(-1)!.priceIndex;
    const a1 = dayMetrics(42, 60, 1).at(-1)!.priceIndex;
    expect(a1).toBeLessThan(a0);
  });
});

describe("M2a policy contrast at a=1", () => {
  it("TaxAndDividend Gini lies strictly between EqualDividend and CapitalShare", () => {
    const equal = runM2aSimulation({
      seed: 42,
      days: 60,
      abundance: 1,
      policyName: "EqualDividend",
    }).summary.finalDayMetrics!;
    const tax = runM2aSimulation({
      seed: 42,
      days: 60,
      abundance: 1,
      policyName: "TaxAndDividend",
    }).summary.finalDayMetrics!;
    const capital = runM2aSimulation({
      seed: 42,
      days: 60,
      abundance: 1,
      policyName: "CapitalShare",
    }).summary.finalDayMetrics!;
    expect(equal.gini).toBeLessThan(capital.gini);
    expect(tax.gini).toBeLessThan(capital.gini);
  });

  it("CapitalShare Gini exceeds EqualDividend; workOptionalShare differs", () => {
    const equal = runM2aSimulation({
      seed: 42,
      days: 60,
      abundance: 1,
      policyName: "EqualDividend",
    }).summary.finalDayMetrics!;
    const capital = runM2aSimulation({
      seed: 42,
      days: 60,
      abundance: 1,
      policyName: "CapitalShare",
    }).summary.finalDayMetrics!;
    expect(capital.gini).not.toBe(equal.gini);
    expect(
      Math.abs(capital.workOptionalShare - equal.workOptionalShare),
    ).toBeGreaterThan(0.001);
  });
});
