import { beforeAll, describe, expect, it } from "vitest";
import { runM2aSimulation, type M2aSimResult } from "../../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";
import { targetGini, targetMedianIncomeUsd } from "../../src/sim/m2a/calibration.js";
import { getTown } from "../../src/town/lindsborg.js";

const LAND_POLICIES = ["PrivateLandlords", "LandValueTax", "CommunityLandTrust"] as const;

interface Fixture {
  lines: DailyMetricLine[];
  summary: M2aSimResult["summary"];
}

const fixtures = new Map<string, Fixture>();

function fixtureKey(abundance: number, landPolicyName: string): string {
  return `${abundance}|${landPolicyName}`;
}

beforeAll(() => {
  const specs = [
    [0, "PrivateLandlords"],
    [0, "LandValueTax"],
    [0, "CommunityLandTrust"],
    [1, "PrivateLandlords"],
    [1, "CommunityLandTrust"],
  ] as const;
  for (const [abundance, landPolicyName] of specs) {
    const result = runM2aSimulation({
      seed: 42,
      days: 365,
      abundance,
      policyName: "Mix",
      landPolicyName,
      m2bEnabled: true,
    });
    fixtures.set(fixtureKey(abundance, landPolicyName), {
      lines: result.dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine),
      summary: result.summary,
    });
  }
});

function fixture(abundance: number, landPolicyName: string): Fixture {
  const found = fixtures.get(fixtureKey(abundance, landPolicyName));
  if (!found) throw new Error(`missing fixture ${abundance} ${landPolicyName}`);
  return found;
}

describe("M2e land policy a=0 gates", () => {
  for (const landPolicyName of LAND_POLICIES) {
    it(`365d Mix a=0 (${landPolicyName}): median, giniFactor, wageGap`, () => {
      const run = fixture(0, landPolicyName);
      const last = run.lines.at(-1)!;
      const target = targetMedianIncomeUsd();
      expect(Math.abs(last.medianAnnualizedHouseholdIncomeUsd - target) / target).toBeLessThanOrEqual(
        0.05,
      );
      expect(last.giniFactor).toBeGreaterThanOrEqual(0.35);
      expect(last.giniFactor).toBeLessThanOrEqual(0.39);
      expect(Math.abs(last.giniFactor - targetGini())).toBeLessThanOrEqual(0.05);
      expect(last.wageGapCents).toBe(0);
      for (const line of run.lines) expect(line.wageGapCents).toBe(0);
      expect(run.summary.agentCount).toBe(379);
      let sum = 0;
      for (const value of Object.values(run.summary.accountBalancesCents)) {
        expect(value).toBeGreaterThanOrEqual(0);
        sum += value;
      }
      expect(sum).toBe(run.summary.moneySupplyCents);
    });
  }
});

describe("M2e human-made variety", () => {
  it("at a=1 educ and health keep positive human-variant spending share", () => {
    const last = fixture(1, "PrivateLandlords").lines.at(-1)!;
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
    const last = fixture(0, "PrivateLandlords").lines.at(-1)!;
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
    const privateGini = fixture(1, "PrivateLandlords").lines.at(-1)!.giniDisposable;
    const cltGini = fixture(1, "CommunityLandTrust").lines.at(-1)!.giniDisposable;
    expect(cltGini).toBeLessThanOrEqual(privateGini);
  });
});
