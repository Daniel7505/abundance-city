import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { targetGini, targetMedianIncomeUsd } from "../src/sim/m2a/calibration.js";
import { getTown } from "../src/town/lindsborg.js";

const LAND_POLICIES = ["PrivateLandlords", "LandValueTax", "CommunityLandTrust"] as const;

function lastLine(
  abundance: number,
  policyName: string,
  landPolicyName: string,
): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance,
    policyName,
    landPolicyName,
    m2bEnabled: true,
  });
  return JSON.parse(dailyMetrics.at(-1)!) as DailyMetricLine;
}

describe("M2e land policy a=0 gates", () => {
  for (const landPolicyName of LAND_POLICIES) {
    it(`365d Mix a=0 (${landPolicyName}): median, giniFactor, wageGap`, () => {
      const last = lastLine(0, "Mix", landPolicyName);
      const target = targetMedianIncomeUsd();
      expect(Math.abs(last.medianAnnualizedHouseholdIncomeUsd - target) / target).toBeLessThanOrEqual(
        0.05,
      );
      expect(last.giniFactor).toBeGreaterThanOrEqual(0.35);
      expect(last.giniFactor).toBeLessThanOrEqual(0.391);
      expect(Math.abs(last.giniFactor - targetGini())).toBeLessThanOrEqual(0.05);
      expect(last.wageGapCents).toBe(0);
    });
  }
});

describe("M2e human-made variety", () => {
  it("at a=1 educ and health keep positive human-variant spending share", () => {
    const last = lastLine(1, "Mix", "PrivateLandlords");
    const town = getTown();
    const labels = town.industry_employment_c24030.map((r) => r.id);
    const shares = last.humanVariantShareByIndustry ?? [];
    const educ = shares[labels.indexOf("educ")] ?? 0;
    const health = shares[labels.indexOf("health")] ?? 0;
    const mfg = shares[labels.indexOf("mfg")] ?? 0;
    expect(educ).toBeGreaterThan(0);
    expect(health).toBeGreaterThan(0);
    expect(educ).toBeGreaterThan(mfg);
  });

  it("at a=0 human-variant share is 100% where goods spend occurs", () => {
    const last = lastLine(0, "Mix", "PrivateLandlords");
    const shares = last.humanVariantShareByIndustry ?? [];
    const anySpend = shares.some((s) => s > 0);
    expect(anySpend).toBe(true);
    for (const s of shares) {
      if (s > 0) expect(s).toBeCloseTo(1, 5);
    }
  });
});

describe("M2e land policy contrast at a=1", () => {
  it("CommunityLandTrust giniDisposable <= PrivateLandlords (Mix)", () => {
    const privateGini = lastLine(1, "Mix", "PrivateLandlords").giniDisposable;
    const cltGini = lastLine(1, "Mix", "CommunityLandTrust").giniDisposable;
    expect(cltGini).toBeLessThanOrEqual(privateGini);
  });
});
