import { describe, expect, it } from "vitest";
import { dwellingRentCentsPerDay } from "../src/sim/m2a/housing-rent.js";
import { housingDwellingRentParameters } from "../src/economy/sectors/parameters.js";
import { sectorYearPnL, type SectorCostParameters } from "../src/economy/sectors/pnl.js";

const sample: SectorCostParameters = {
  laborShare0: 0.4,
  automatability: 0.5,
  nonlaborCostDeclineAtFullAutomation: 0.2,
  outputGrowthAtFullAutomation: 0,
  pricePassThrough: 1,
};

describe("sector P&L", () => {
  it("starts at unit cost 1, price 1, and a zero surplus under both policies", () => {
    for (const wagePolicy of ["MarketWages", "WageGuarantee"] as const) {
      const row = sectorYearPnL(0, wagePolicy, sample);
      expect(row.outputIndex).toBe(1);
      expect(row.unitCostIndex).toBeCloseTo(1);
      expect(row.laborShare).toBeCloseTo(sample.laborShare0);
      expect(row.wageBillIndex).toBeCloseTo(1);
      expect(row.wageTopUpIndex).toBe(0);
      expect(row.priceIndex).toBeCloseTo(1);
      expect(row.surplusIndex).toBeCloseTo(0);
    }
  });

  it("sheds labor under MarketWages and tops the wage bill back up under WageGuarantee", () => {
    const market = sectorYearPnL(1, "MarketWages", sample);
    const guarantee = sectorYearPnL(1, "WageGuarantee", sample);

    expect(market.unitLaborCostIndex).toBeCloseTo(0.2);
    expect(market.unitNonlaborCostIndex).toBeCloseTo(0.48);
    expect(market.unitCostIndex).toBeCloseTo(0.68);
    expect(market.priceIndex).toBeCloseTo(0.68);
    expect(market.wageBillIndex).toBeCloseTo(0.5);
    expect(market.wageTopUpIndex).toBe(0);
    expect(market.surplusIndex).toBeCloseTo(0);

    expect(guarantee.unitLaborCostIndex).toBeCloseTo(0.4);
    expect(guarantee.unitCostIndex).toBeCloseTo(0.88);
    expect(guarantee.priceIndex).toBeCloseTo(0.88);
    expect(guarantee.wageBillIndex).toBeCloseTo(1);
    expect(guarantee.wageTopUpIndex).toBeCloseTo(0.2);
    expect(guarantee.surplusIndex).toBeCloseTo(0);
    expect(guarantee.priceIndex).toBeGreaterThan(market.priceIndex);
  });

  it("keeps the wage bill flat when supply grows, and holds the zero-surplus identity", () => {
    const growing: SectorCostParameters = { ...sample, outputGrowthAtFullAutomation: 0.25 };
    const market = sectorYearPnL(1, "MarketWages", growing);
    expect(market.outputIndex).toBeCloseTo(1.25);
    expect(market.wageBillIndex).toBeCloseTo(0.5);
    expect(market.unitLaborCostIndex).toBeCloseTo(0.16);
    expect(market.revenueIndex).toBeCloseTo(market.priceIndex * market.outputIndex);
    expect(market.surplusIndex).toBeCloseTo(0);

    const partial: SectorCostParameters = { ...growing, pricePassThrough: 0.5 };
    const held = sectorYearPnL(1, "MarketWages", partial);
    const expectedPrice = 1 - 0.5 * (1 - held.unitCostIndex);
    expect(held.priceIndex).toBeCloseTo(expectedPrice);
    expect(held.surplusIndex).toBeCloseTo(
      held.revenueIndex - held.wageBillIndex * partial.laborShare0 - held.nonlaborBillIndex,
    );
    expect(held.surplusIndex).toBeGreaterThan(0);
  });

  it("matches the dwelling-rent path for housing under MarketWages", () => {
    const housing = housingDwellingRentParameters();
    for (const abundance of [0, 0.25, 0.5, 1]) {
      const rent0 = dwellingRentCentsPerDay(0).totalCents;
      const rent = dwellingRentCentsPerDay(abundance).totalCents;
      const row = sectorYearPnL(abundance, "MarketWages", housing);
      expect(row.unitCostIndex).toBeCloseTo(rent / rent0, 2);
      expect(row.priceIndex).toBeCloseTo(row.unitCostIndex);
    }
    const full = sectorYearPnL(1, "WageGuarantee", housing);
    const market = sectorYearPnL(1, "MarketWages", housing);
    expect(full.wageBillIndex).toBeCloseTo(1);
    expect(market.wageBillIndex).toBeCloseTo(0);
    expect(full.unitCostIndex).toBeGreaterThan(market.unitCostIndex);
  });
});
