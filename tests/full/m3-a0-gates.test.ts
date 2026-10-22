import { beforeAll, describe, expect, it } from "vitest";
import { runM2aSimulation, type M2aSimResult } from "../../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";
import { targetMedianIncomeUsd } from "../../src/sim/m2a/calibration.js";

const LAND_POLICIES = ["PrivateLandlords", "LandValueTax", "CommunityLandTrust"] as const;
const OWNERSHIP = ["PrivateOwners", "PublicFund", "GradualBuyIn"] as const;

const first = new Map<string, M2aSimResult>();

function key(land: string, ownership: string): string {
  return `${land}|${ownership}`;
}

beforeAll(() => {
  for (const landPolicyName of LAND_POLICIES) {
    for (const ownership of OWNERSHIP) {
      first.set(
        key(landPolicyName, ownership),
        runM2aSimulation({
          seed: 42,
          days: 365,
          abundance: 0,
          policyName: "Mix",
          landPolicyName,
          ownership,
          m2bEnabled: true,
        }),
      );
    }
  }
}, 180_000);

describe("M3 a=0 365d gates for every land policy and ownership", () => {
  for (const landPolicyName of LAND_POLICIES) {
    for (const ownership of OWNERSHIP) {
      it(`${landPolicyName} + ${ownership}: median, giniFactor, wage gap, conservation, count`, () => {
        const result = first.get(key(landPolicyName, ownership));
        if (!result) throw new Error("missing run");
        const lines = result.dailyMetrics.map((line) => JSON.parse(line) as DailyMetricLine);
        const last = lines.at(-1)!;
        const target = targetMedianIncomeUsd();
        expect(target).toBe(81_250);
        expect(
          Math.abs(last.medianAnnualizedHouseholdIncomeUsd - target) / target,
        ).toBeLessThanOrEqual(0.05);
        expect(last.giniFactor).toBeGreaterThanOrEqual(0.35);
        expect(last.giniFactor).toBeLessThanOrEqual(0.39);
        for (const line of lines) expect(line.wageGapCents).toBe(0);
        expect(result.summary.agentCount).toBe(379);
        expect(result.transition.finalAbundance).toBe(0);
        expect(result.transition.ownership).toBe(ownership);
        const year = result.transition.yearlyHarm[0];
        expect(year.partial).toBe(false);
        expect(year.days).toBe(365);
        expect(year.giniDisposable).toBe(last.giniDisposable);
        expect(year.workOptionalShare).toBe(last.workOptionalShare);
        // Subsistence is about 20–35% of ACS income and labor income is 86% of
        // that income, so needs/disposable above 0.40 means the yardstick is
        // still priced like a full day of income. 0.10 on the shortfall share
        // is above the scaled unemployment count and far below the old ~0.50.
        expect(year.shortfallShare).toBeLessThanOrEqual(0.1);
        expect(year.needsToDisposable).toBeLessThan(0.4);
        expect(year.quintileBasis).toBe("worldgenIncome");
        expect(year.spellDaysP90).toBeLessThan(year.days);
        const shares = year.byQuintile.map((q) => q.shortfallShare);
        expect(shares).toHaveLength(5);
        for (let i = 0; i < 4; i++) {
          expect(shares[i]).toBeGreaterThanOrEqual(shares[i + 1]);
        }
        expect(shares[0]).toBe(Math.max(...shares));
        let sum = 0;
        for (const value of Object.values(result.summary.accountBalancesCents)) {
          expect(value).toBeGreaterThanOrEqual(0);
          sum += value;
        }
        expect(sum).toBe(result.summary.moneySupplyCents);
        if (ownership !== "PrivateOwners") {
          expect(result.summary.accountBalancesCents.publicFund).toBe(0);
        }
      });

      it(`${landPolicyName} + ${ownership} is deterministic`, () => {
        const baseline = first.get(key(landPolicyName, ownership));
        if (!baseline) throw new Error("missing run");
        const again = runM2aSimulation({
          seed: 42,
          days: 365,
          abundance: 0,
          policyName: "Mix",
          landPolicyName,
          ownership,
          m2bEnabled: true,
        });
        expect(again.dailyMetrics.join("\n")).toBe(baseline.dailyMetrics.join("\n"));
        expect(JSON.stringify(again.summary)).toBe(JSON.stringify(baseline.summary));
        expect(JSON.stringify(again.transition.yearlyHarm)).toBe(
          JSON.stringify(baseline.transition.yearlyHarm),
        );
      });
    }
  }
});
