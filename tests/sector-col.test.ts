import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import sources from "../data/sources.json" with { type: "json" };
import {
  abundanceAtYear,
  buildSectorRoadmap,
  costOfLivingPoint,
  expenditureMeansUsd,
  expenditureSharePercent,
  sectorBaselineUsd,
  sectorDefinitions,
} from "../src/economy/sectors/cost-of-living.js";

const totals = sources.consumerExpenditure.quintilesOfIncomeBeforeTaxes.averageAnnualExpendituresUsd;

describe("cost of living rollup", () => {
  it("uses the 2024 Table 1101 housing and food shares", () => {
    const housing = expenditureMeansUsd("housing");
    const food = expenditureMeansUsd("food");
    expect(expenditureSharePercent(housing[0], totals[0])).toBe(41.6);
    expect(expenditureSharePercent(housing[4], totals[4])).toBe(29.3);
    expect(expenditureSharePercent(food[0], totals[0])).toBe(15.7);
    expect(expenditureSharePercent(food[4], totals[4])).toBe(11.3);
    expect(expenditureSharePercent(housing[1], totals[1])).toBe(38.3);
    expect(expenditureSharePercent(housing[2], totals[2])).toBe(36.0);
    expect(expenditureSharePercent(housing[3], totals[3])).toBe(32.6);
    expect(expenditureSharePercent(food[1], totals[1])).toBe(14.8);
    expect(expenditureSharePercent(food[2], totals[2])).toBe(13.6);
    expect(expenditureSharePercent(food[3], totals[3])).toBe(13.2);
  });

  it("keeps the all-consumer-unit shares already used by the town file", () => {
    const town = JSON.parse(readFileSync("data/towns/lindsborg-ks.json", "utf8")) as {
      ce_housing_share: { value: number };
      ce_transport_share: { value: number };
      ce_food_share: { value: number };
      ce_health_share: { value: number };
      ce_avg_annual_spending_usd: { value: number };
    };
    const all = sources.consumerExpenditure.allConsumerUnits;
    expect(town.ce_housing_share.value).toBe(all.sharesOfExpenditures.housing);
    expect(town.ce_transport_share.value).toBe(all.sharesOfExpenditures.transportation);
    expect(town.ce_food_share.value).toBe(all.sharesOfExpenditures.food);
    expect(town.ce_health_share.value).toBe(all.sharesOfExpenditures.healthcare);
    expect(town.ce_avg_annual_spending_usd.value).toBe(all.averageAnnualExpendituresUsd);
  });

  it("partitions the basket without overlap or a negative weight", () => {
    const sectors = sectorDefinitions();
    const byId = new Map(sectors.map((sector) => [sector.id, sector]));
    for (const quintile of [1, 2, 3, 4, 5] as const) {
      for (const sector of sectors) {
        if (sector.inCostOfLiving) {
          expect(sectorBaselineUsd(sector, quintile)).toBeGreaterThan(0);
        }
      }
      expect(sectorBaselineUsd(byId.get("housing")!, quintile) + sectorBaselineUsd(byId.get("utilities")!, quintile)).toBe(
        expenditureMeansUsd("housing")[quintile - 1],
      );
      expect(
        sectorBaselineUsd(byId.get("transport")!, quintile) + expenditureMeansUsd("vehicleInsurance")[quintile - 1],
      ).toBe(expenditureMeansUsd("transportation")[quintile - 1]);
      expect(
        sectorBaselineUsd(byId.get("healthcare")!, quintile) + expenditureMeansUsd("healthInsurance")[quintile - 1],
      ).toBe(expenditureMeansUsd("healthcare")[quintile - 1]);
      expect(sectorBaselineUsd(byId.get("logistics")!, quintile)).toBe(0);
    }
  });

  it("rolls the year-0 basket up from the verified category dollars", () => {
    const series = buildSectorRoadmap();
    const sectors = sectorDefinitions().filter((sector) => sector.inCostOfLiving);
    for (const quintile of [1, 2, 3, 4, 5] as const) {
      const expected = sectors.reduce((sum, sector) => sum + sectorBaselineUsd(sector, quintile), 0);
      for (const wagePolicy of ["MarketWages", "WageGuarantee"] as const) {
        const point = costOfLivingPoint(series, 0, wagePolicy, quintile);
        expect(point.costOfLivingUsd).toBe(expected);
        expect(point.bySectorUsd.housing).toBe(sectorBaselineUsd(sectors.find((s) => s.id === "housing")!, quintile));
      }
    }
    expect(costOfLivingPoint(series, 0, "MarketWages", 1).costOfLivingUsd).toBe(28785);
    expect(costOfLivingPoint(series, 0, "MarketWages", 5).costOfLivingUsd).toBe(97510);
  });

  it("prices the same basket forward, and MarketWages is cheaper by year 10", () => {
    const series = buildSectorRoadmap();
    for (const quintile of [1, 2, 3, 4, 5] as const) {
      const start = costOfLivingPoint(series, 0, "MarketWages", quintile).costOfLivingUsd;
      const market = costOfLivingPoint(series, 10, "MarketWages", quintile);
      const guarantee = costOfLivingPoint(series, 10, "WageGuarantee", quintile);
      expect(market.costOfLivingUsd).toBeLessThan(start);
      expect(guarantee.costOfLivingUsd).toBeLessThan(start);
      expect(market.costOfLivingUsd).toBeLessThan(guarantee.costOfLivingUsd);
      const recomputed = Object.values(market.bySectorUsd).reduce((sum, dollars) => sum + dollars, 0);
      expect(Math.abs(recomputed - market.costOfLivingUsd)).toBeLessThan(0.05);
    }
  });

  it("matches the series file a time slider can read", () => {
    const onDisk = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8"));
    expect(onDisk).toEqual(buildSectorRoadmap());
  });

  it("is a year-indexed series a time slider can filter", () => {
    const series = buildSectorRoadmap();
    expect(series.schema).toBe("abundance-city.sector-roadmap.v1");
    expect(series.years).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(series.wagePolicies).toEqual(["MarketWages", "WageGuarantee"]);
    expect(series.quintiles).toEqual([1, 2, 3, 4, 5]);
    expect(series.sectorsInCostOfLiving).not.toContain("logistics");
    expect(series.costOfLiving).toHaveLength(11 * 2 * 5);
    expect(series.pnl.some((row) => row.sectorId === "logistics")).toBe(true);
    expect(series.costOfLiving.every((row) => series.years.includes(row.year))).toBe(true);
    expect(abundanceAtYear(0)).toBe(0);
    expect(abundanceAtYear(10)).toBe(1);
    expect(abundanceAtYear(5)).toBeCloseTo(0.5);
    const midpoint = series.costOfLiving.filter((row) => row.year === 5);
    expect(midpoint).toHaveLength(10);
    expect(midpoint.every((row) => row.abundance === 0.5)).toBe(true);
  });
});
