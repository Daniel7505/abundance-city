import { beforeAll, describe, expect, it } from "vitest";
import { runM2aSimulation } from "../../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";

function finalMetrics(policyName: string): DailyMetricLine {
  const { summary } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance: 1,
    policyName,
    m2bEnabled: true,
  });
  return summary.finalDayMetrics!;
}

describe("M2b policy contrast at a=1 (quantity needs)", () => {
  let equal: DailyMetricLine;
  let tax: DailyMetricLine;
  let capital: DailyMetricLine;

  beforeAll(() => {
    equal = finalMetrics("EqualDividend");
    tax = finalMetrics("TaxAndDividend");
    capital = finalMetrics("CapitalShare");
  });

  it("CapitalShare Gini exceeds EqualDividend after trailing window (365d)", () => {
    expect(capital.giniDisposable).toBeGreaterThan(equal.giniDisposable);
  });

  it("TaxAndDividend is more equalizing than EqualDividend; CapitalShare exceeds Equal (365d)", () => {
    expect(capital.giniDisposable).toBeGreaterThan(equal.giniDisposable);
    expect(tax.giniDisposable).toBeLessThan(capital.giniDisposable);
  });
});
