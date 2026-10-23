import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import { parseWagePolicy } from "../src/economy/m2a/wage-policy.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

function lines(wagePolicy: "MarketWages" | "WageGuarantee"): DailyMetricLine[] {
  const result = runM2aSimulation({
    seed: 42,
    days: 20,
    abundance: 1,
    policyName: "Mix",
    landPolicyName: "PrivateLandlords",
    ownership: "PrivateOwners",
    m2bEnabled: true,
    humanPremiumMode: "adaptive",
    wagePolicy,
  });
  return result.dailyMetrics.map((line) => JSON.parse(line) as DailyMetricLine);
}

describe("wage policy", () => {
  it("defaults to MarketWages and rejects an unknown name", () => {
    expect(parseWagePolicy(undefined)).toBe("MarketWages");
    expect(parseWagePolicy("WageGuarantee")).toBe("WageGuarantee");
    expect(() => parseWagePolicy("BasicIncome")).toThrow(/Unknown wage policy/);
  });

  it("MarketWages posts no producer wage claim and still pays the fitted bill", () => {
    const market = lines("MarketWages");
    const guarantee = lines("WageGuarantee");
    const claim = (rows: DailyMetricLine[]) =>
      rows.reduce((sum, row) => sum + (row.humanWageClaimCents ?? 0), 0);

    expect(claim(market)).toBe(0);
    expect(claim(guarantee)).toBeGreaterThan(0);
    for (const row of market) expect(row.wageGapCents).toBe(0);
    for (const row of guarantee) expect(row.wageGapCents).toBe(0);
    expect(market.at(-1)!.employed).toBeLessThan(guarantee.at(-1)!.employed);
  });
});
