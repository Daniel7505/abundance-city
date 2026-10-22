import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { scaledHouseholdCount } from "../src/town/lindsborg.js";

function day29(seed: number, abundance: number): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({ seed, days: 30, abundance });
  return JSON.parse(dailyMetrics[dailyMetrics.length - 1]) as DailyMetricLine;
}

describe("M2a economic sanity", () => {
  it("a=0: byIndustry jobs sum to employed with positive wages", () => {
    const m = day29(42, 0);
    const jobs = m.byIndustry.reduce((s, r) => s + r.jobs, 0);
    const wages = m.byIndustry.reduce((s, r) => s + r.wages, 0);
    expect(m.employed).toBe(202);
    expect(jobs).toBe(m.employed);
    expect(wages).toBeGreaterThan(0);
  });

  it("a=0: workOptionalShare near real-world baseline", () => {
    const m = day29(42, 0);
    expect(m.workOptionalShare).toBeLessThanOrEqual(0.1);
  });

  it("a=0: short households within poverty-scale band", () => {
    const m = day29(42, 0);
    const maxShort = Math.ceil(scaledHouseholdCount() * 0.15);
    expect(m.shortHouseholds).toBeLessThanOrEqual(maxShort);
    expect(m.unmetNeed).toBeLessThan(500_000);
  });

  it("a=1: Gini remains positive with income-weighted abundance dividends", () => {
    const m = day29(42, 1);
    expect(m.gini).toBeGreaterThan(0);
  });

  it("a=0: Gini stable on annualized household income (day 60 vs day 0)", () => {
    const { dailyMetrics } = runM2aSimulation({ seed: 42, days: 60, abundance: 0 });
    const day0 = JSON.parse(dailyMetrics[0]) as DailyMetricLine;
    const day59 = JSON.parse(dailyMetrics[59]) as DailyMetricLine;
    expect(Math.abs(day59.gini - day0.gini)).toBeLessThanOrEqual(0.05);
  });

  it("a=0: treasury wage subsidy is negligible vs payroll", () => {
    const { dailyMetrics } = runM2aSimulation({ seed: 42, days: 60, abundance: 0 });
    let subsidy = 0;
    let payroll = 0;
    for (const line of dailyMetrics) {
      const m = JSON.parse(line) as DailyMetricLine;
      subsidy += m.wageSubsidyCents;
      payroll += m.payrollCents;
    }
    expect(payroll).toBeGreaterThan(0);
    expect(subsidy / payroll).toBeLessThanOrEqual(0.01);
  });
});
