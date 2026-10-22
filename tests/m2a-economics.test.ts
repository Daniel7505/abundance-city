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
});
