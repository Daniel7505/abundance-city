import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";

/**
 * Fixed a=1, 50 days, m2b on, adaptive premium, private landlords, private owners.
 * The needs basket is about 3% of disposable income on every seed, so the town
 * can afford the basket. EqualDividend pays the surplus to each household and
 * the shortfall share is 0. CapitalShare pays that same surplus in proportion
 * to ownership. Seed 42 then leaves a shortfall share of 0.062 (depth 0.39);
 * across seeds 42–46 the share is 0.028 to 0.072. Same jobs, same basket, same
 * aggregate income. The remainder is who receives it.
 */
const SEEDS = [42, 43, 44, 45, 46] as const;

function run(seed: number, policyName: "EqualDividend" | "CapitalShare") {
  return runM2aSimulation({
    seed,
    days: 50,
    abundance: 1,
    policyName,
    landPolicyName: "PrivateLandlords",
    ownership: "PrivateOwners",
    m2bEnabled: true,
    humanPremiumMode: "adaptive",
  });
}

describe("abundance sufficiency", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}: equal dividends cover the basket, ownership shares do not`, () => {
      const routed = run(seed, "EqualDividend").transition.yearlyHarm[0];
      const privateOwners = run(seed, "CapitalShare").transition.yearlyHarm[0];

      expect(routed.days).toBe(50);
      expect(privateOwners.days).toBe(50);
      expect(routed.needsToDisposable).toBeLessThan(0.05);
      expect(privateOwners.needsToDisposable).toBeLessThan(0.05);
      expect(Math.abs(routed.needsToDisposable - privateOwners.needsToDisposable)).toBeLessThan(
        0.001,
      );

      expect(routed.shortfallShare).toBe(0);
      expect(routed.avgShortfallDepth).toBe(0);
      expect(routed.everShortShare).toBe(0);

      expect(privateOwners.shortfallShare).toBeGreaterThan(0.02);
      expect(privateOwners.avgShortfallDepth).toBeGreaterThan(0.15);
      expect(privateOwners.shortfallShare).toBeGreaterThan(routed.shortfallShare);
    });
  }
});
