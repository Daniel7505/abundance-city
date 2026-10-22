import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import {
  expectedIndustrySlots,
  targetAgentCount,
  targetGini,
  targetMedianIncomeUsd,
  targetRenterShare,
} from "../src/sim/m2a/calibration.js";

describe("Lindsborg calibration", () => {
  it("matches scaled ACS targets at a=0 day 0", () => {
    const { summary } = runM2aSimulation({ seed: 42, days: 1, abundance: 0 });
    const snap = summary.calibrationDay0;
    expect(Math.abs(snap.agentCount - targetAgentCount())).toBeLessThanOrEqual(1);
    expect(snap.employed).toBe(202);
    expect(snap.industryCounts).toEqual(expectedIndustrySlots());
    expect(snap.medianHouseholdIncomeUsd).toBeGreaterThan(targetMedianIncomeUsd() * 0.9);
    expect(snap.medianHouseholdIncomeUsd).toBeLessThan(targetMedianIncomeUsd() * 1.1);
    expect(Math.abs(snap.giniHouseholdIncome - targetGini())).toBeLessThanOrEqual(0.05);
    expect(Math.abs(snap.renterShare - targetRenterShare())).toBeLessThanOrEqual(0.03);
  });
});
