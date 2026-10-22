import { describe, expect, it } from "vitest";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { assignHouseholdIncomeQuintiles } from "../src/sim/m2a/distribution.js";
import { householdHousingNeedsCentsAt } from "../src/sim/m2a/housing-calibration.js";
import { dwellingRentCentsPerDay } from "../src/sim/m2a/housing-rent.js";
import { householdDailyNeedsCentsFromQuantities } from "../src/sim/m2a/needs.js";
import { needsPriceContext } from "../src/sim/m2a/needs-prices.js";

describe("M2d housing quantity model", () => {
  it("uses one dwelling-unit per household and land rent does not fall at a=1", () => {
    const world = buildM2aWorld(42);
    expect(world.households.every((h) => h.needsQuantity.housingServiceUnits === 1)).toBe(
      true,
    );
    const r0 = dwellingRentCentsPerDay(0);
    const r1 = dwellingRentCentsPerDay(1);
    expect(r1.landRentCents).toBe(r0.landRentCents);
    expect(r1.maintenanceCents).toBeLessThanOrEqual(r0.maintenanceCents);
  });

  it("calibrates higher housing share of needs in Q1 than Q5 at a=0", () => {
    const world = buildM2aWorld(42);
    const quintiles = assignHouseholdIncomeQuintiles(world.households);
    const prices = needsPriceContext(world, 0);
    const shareByQ = new Map<number, number[]>();
    for (const hh of world.households) {
      const q = quintiles.get(hh.id)!;
      const needs = householdDailyNeedsCentsFromQuantities(hh, prices, 0);
      const share = needs.housing / needs.requiredTotal;
      const list = shareByQ.get(q) ?? [];
      list.push(share);
      shareByQ.set(q, list);
    }
    const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const q1 = mean(shareByQ.get(1)!);
    const q5 = mean(shareByQ.get(5)!);
    expect(q1).toBeGreaterThan(q5);
    expect(householdHousingNeedsCentsAt(world.households[0], 0)).toBeGreaterThan(1000);
  });
});
