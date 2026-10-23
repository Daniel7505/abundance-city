import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";

/**
 * Fixed a=1, 50 days, m2b on, adaptive premium, private landlords, private owners.
 * Productive capacity covers the needs basket: needs are about 3% of disposable
 * income on every seed. EqualDividend routes the producer margin to each
 * household. CapitalShare pays that same margin in proportion to ownership
 * and does not route it. Both pay the basket, so the unmet-needs shortfall is
 * 0 either way. The gap that remains is distribution: disposable-income Gini
 * is about 0.27 with equal dividends and about 0.50 when the margin follows
 * ownership.
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
    it(`seed ${seed}: the basket is affordable, and ownership routing still raises inequality`, () => {
      const routed = run(seed, "EqualDividend").transition.yearlyHarm[0];
      const unrouted = run(seed, "CapitalShare").transition.yearlyHarm[0];

      expect(routed.days).toBe(50);
      expect(unrouted.days).toBe(50);
      expect(routed.needsToDisposable).toBeLessThan(0.05);
      expect(unrouted.needsToDisposable).toBeLessThan(0.05);
      expect(Math.abs(routed.needsToDisposable - unrouted.needsToDisposable)).toBeLessThan(
        0.001,
      );

      expect(routed.shortfallShare).toBe(0);
      expect(routed.avgShortfallDepth).toBe(0);
      expect(routed.everShortShare).toBe(0);
      expect(unrouted.shortfallShare).toBe(0);
      expect(unrouted.avgShortfallDepth).toBe(0);
      expect(unrouted.everShortShare).toBe(0);

      expect(unrouted.giniDisposable).toBeGreaterThan(routed.giniDisposable);
    });
  }
});
