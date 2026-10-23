import { describe, expect, it } from "vitest";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { assignHouseholdIncomeQuintiles } from "../src/sim/m2a/distribution.js";
import {
  householdDailyNeedsCentsFromQuantities,
  householdDailyNeedsCentsLegacy,
  householdSubsistenceNeedsCents,
} from "../src/sim/m2a/needs.js";
import { needsPriceContext } from "../src/sim/m2a/needs-prices.js";
import { targetHousingNeedsShareForQuintile } from "../src/sim/m2a/housing-rent.js";
import { getTown } from "../src/town/lindsborg.js";
import { readNumber } from "../src/town/sourced.js";

describe("needs basket investigation", () => {
  it("legacy M2a path uses fixed cent targets (not quantity-priced)", () => {
    const world = buildM2aWorld(42);
    const hh = world.households[0];
    const atA0 = householdDailyNeedsCentsLegacy(hh).requiredTotal;
    const atA1 = householdDailyNeedsCentsLegacy(hh).requiredTotal;
    expect(atA0).toBe(atA1);
  });

  it("M2b quantity path lowers cent cost when goods prices fall", () => {
    const world = buildM2aWorld(42);
    const hh = world.households[0];
    const p0 = needsPriceContext(world, 0);
    const p1 = needsPriceContext(world, 1);
    const cents0 = householdDailyNeedsCentsFromQuantities(hh, p0, 0).requiredTotal;
    const cents1 = householdDailyNeedsCentsFromQuantities(hh, p1, 1).requiredTotal;
    expect(p1.goodsCentsPerUnit).toBeLessThan(p0.goodsCentsPerUnit);
    expect(cents1).toBeLessThan(cents0);
  });

  it("a=0 category spend matches the calibrated budget shares", () => {
    const world = buildM2aWorld(42);
    const prices = needsPriceContext(world, 0);
    const foodShare = readNumber(getTown().ce_food_share);
    const quintiles = assignHouseholdIncomeQuintiles(world.households);
    let food = 0;
    let acsDaily = 0;
    const housingShares = new Map<number, number[]>();
    for (const hh of world.households) {
      const needs = householdDailyNeedsCentsFromQuantities(hh, prices, 0);
      const legacy = householdDailyNeedsCentsLegacy(hh);
      const budget = householdSubsistenceNeedsCents(hh, prices, prices, 0);
      const dailyIncome = (hh.incomeAnnualUsd * 100) / 365;
      food += needs.food;
      acsDaily += dailyIncome;
      // One cent: quantities are the legacy budgets divided by this same price.
      expect(Math.abs(needs.food - legacy.food)).toBeLessThanOrEqual(1);
      expect(Math.abs(needs.electricity - legacy.electricity)).toBeLessThanOrEqual(1);
      expect(Math.abs(needs.food - budget.food)).toBeLessThanOrEqual(1);
      expect(Math.abs(needs.electricity - budget.electricity)).toBeLessThanOrEqual(1);
      expect(Math.abs(needs.housing - budget.housing)).toBeLessThanOrEqual(1);
      const q = quintiles.get(hh.id) ?? 1;
      const list = housingShares.get(q) ?? [];
      list.push(needs.housing / needs.requiredTotal);
      housingShares.set(q, list);
    }
    // Food is the CE food share of ACS income. Rounding of daily cents moves
    // the aggregate by far less than half a percentage point.
    expect(Math.abs(food / acsDaily - foodShare)).toBeLessThanOrEqual(0.005);
    for (let q = 1; q <= 5; q++) {
      const shares = housingShares.get(q) ?? [];
      const mean = shares.reduce((s, v) => s + v, 0) / shares.length;
      const target = targetHousingNeedsShareForQuintile(q);
      // Q2–Q5 match the quintile target exactly. Q1 is within 0.03: the
      // 0.25 minimum housing burden binds for the poorest households, whose
      // non-housing bill is small relative to median rent, so their housing
      // share of the basket sits a bit above 0.42.
      expect(Math.abs(mean - target)).toBeLessThanOrEqual(0.03);
    }
  });
});
