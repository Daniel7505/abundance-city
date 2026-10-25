import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { MAP_SIZE, WORK_REGION } from "../src/sim/config.js";
import { assignHouseholdIncomeQuintiles } from "../src/sim/m2a/distribution.js";
import type { Household, M2aWorld } from "../src/sim/m2a/types.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import {
  PANEL_SECTORS,
  basketChartSvg,
  basketCostUsd,
  costOfLivingIndex,
  formatIncomeUsd,
  formatIndex,
  formatUsd,
  householdBasketSeries,
  householdPanelModel,
  initialViewSelection,
  layoutHouseholdResidences,
  loadBundledSectorRoadmap,
  loadSectorRoadmap,
  mapHouseholdsToIncomeFifths,
  residenceColorHex,
  sectorPriceIndex,
  sidePanelModel,
  type LoadedSectorRoadmap,
} from "../src/view/roadmap-view.js";

function household(id: number, incomeAnnualUsd: number): Household {
  return {
    id,
    size: 1,
    incomeAnnualUsd,
    isRenter: false,
    agentIds: [],
    needsQuantity: { housingServiceUnits: 0, foodGoodsUnits: 0, electricityKwh: 0 },
    housingBurdenMultiplier: 1,
  };
}

function polylinePoints(svg: string, policy: string): string[] {
  const match = svg.match(new RegExp(`data-policy="${policy}"[^>]*points="([^"]+)"`));
  if (!match) throw new Error(`Missing ${policy} polyline`);
  return match[1].trim().split(" ");
}

function pointY(point: string): number {
  return Number(point.split(",")[1]);
}

describe("sector roadmap loading", () => {
  const disk = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")) as {
    pnl: Array<{ sectorId: string; year: number; wagePolicy: string; priceIndex: number }>;
    costOfLiving: Array<{ year: number; wagePolicy: string; quintile: number; costOfLivingUsd: number }>;
    sectorsInCostOfLiving: string[];
  };
  const loaded = loadSectorRoadmap(disk);

  it("reads the published series, including a price that was edited in memory", () => {
    const raw = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")) as typeof disk;
    const housing = raw.pnl.find(
      (row) => row.sectorId === "housing" && row.year === 4 && row.wagePolicy === "MarketWages",
    );
    if (!housing) throw new Error("missing housing row");
    housing.priceIndex = 0.1234;
    const edited = loadSectorRoadmap(raw);
    expect(sectorPriceIndex(edited, "housing", 4, "MarketWages")).toBe(0.1234);

    const bundled = loadBundledSectorRoadmap();
    expect(basketCostUsd(bundled, 0, "MarketWages", 1)).toBe(basketCostUsd(loaded, 0, "MarketWages", 1));
    expect(sectorPriceIndex(bundled, "housing", 10, "MarketWages")).toBe(
      sectorPriceIndex(loaded, "housing", 10, "MarketWages"),
    );
  });

  it("uses the on-disk price and basket rows", () => {
    for (const sectorId of PANEL_SECTORS) {
      for (const year of [0, 10]) {
        for (const wagePolicy of ["MarketWages", "WageGuarantee"] as const) {
          const row = disk.pnl.find((entry) => entry.sectorId === sectorId && entry.year === year && entry.wagePolicy === wagePolicy);
          expect(sectorPriceIndex(loaded, sectorId, year, wagePolicy)).toBe(row?.priceIndex);
        }
      }
    }
    expect(basketCostUsd(loaded, 0, "MarketWages", 1)).toBe(28785);
    expect(basketCostUsd(loaded, 0, "WageGuarantee", 1)).toBe(28785);
    expect(basketCostUsd(loaded, 0, "MarketWages", 5)).toBe(97510);
    expect(Math.round(basketCostUsd(loaded, 10, "MarketWages", 1))).toBe(18390);
    expect(Math.round(basketCostUsd(loaded, 10, "WageGuarantee", 1))).toBe(23555);
    expect(Math.round(basketCostUsd(loaded, 10, "MarketWages", 5))).toBe(61871);
    expect(Math.round(basketCostUsd(loaded, 10, "WageGuarantee", 5))).toBe(79828);
    expect(loaded.sectorsInCostOfLiving).not.toContain("logistics");
    expect(sectorPriceIndex(loaded, "logistics", 0, "MarketWages")).toBe(1);
  });

  it("divides by the same policy's year-0 basket", () => {
    const raw = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")) as typeof disk;
    const marketBase = raw.costOfLiving.find((row) => row.year === 0 && row.wagePolicy === "MarketWages" && row.quintile === 1);
    const guaranteeBase = raw.costOfLiving.find((row) => row.year === 0 && row.wagePolicy === "WageGuarantee" && row.quintile === 1);
    const marketYear = raw.costOfLiving.find((row) => row.year === 3 && row.wagePolicy === "MarketWages" && row.quintile === 1);
    if (!marketBase || !guaranteeBase || !marketYear) throw new Error("missing basket rows");
    marketBase.costOfLivingUsd = 100;
    guaranteeBase.costOfLivingUsd = 400;
    marketYear.costOfLivingUsd = 80;
    const edited = loadSectorRoadmap(raw);
    expect(costOfLivingIndex(edited, 3, "MarketWages", 1)).toBeCloseTo(0.8);
    expect(costOfLivingIndex(edited, 0, "WageGuarantee", 1)).toBe(1);
  });

  it("rejects a roadmap the slider cannot filter", () => {
    expect(() => loadSectorRoadmap({ schema: "other" })).toThrow(/schema/);
    const missing = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")) as typeof disk;
    const index = missing.costOfLiving.findIndex((row) => row.year === 6 && row.wagePolicy === "MarketWages" && row.quintile === 2);
    missing.costOfLiving.splice(index, 1);
    expect(() => loadSectorRoadmap(missing)).toThrow(/Missing cost of living/);
    const duplicate = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")) as typeof disk;
    duplicate.pnl.push({ ...duplicate.pnl[0] });
    expect(() => loadSectorRoadmap(duplicate)).toThrow(/Duplicate price row/);
    const badPrice = JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")) as typeof disk;
    badPrice.pnl[0].priceIndex = Number.NaN;
    expect(() => loadSectorRoadmap(badPrice)).toThrow(/finite/);
  });

  it("builds the side panel and both wage-policy series from the file", () => {
    const year0 = sidePanelModel(loaded, 0, "MarketWages");
    expect(year0.sectors.map((row) => row.sectorId)).toEqual([...PANEL_SECTORS]);
    expect(year0.sectors.every((row) => row.priceIndex === 1)).toBe(true);
    expect(year0.fifths.map((row) => row.quintile)).toEqual([1, 2, 3, 4, 5]);
    expect(year0.fifths.every((row) => row.indexText === "1.000")).toBe(true);
    expect(year0.fifths[0].costText).toBe("$28,785");
    expect(year0.fifths[0].label).toBe("Lowest");
    expect(year0.fifths[4].label).toBe("Highest");

    const market = sidePanelModel(loaded, 10, "MarketWages");
    const guarantee = sidePanelModel(loaded, 10, "WageGuarantee");
    expect(market.fifths[0].costUsd).toBeLessThan(year0.fifths[0].costUsd);
    expect(market.fifths[0].costUsd).toBeLessThan(guarantee.fifths[0].costUsd);
    expect(market.sectors.find((row) => row.sectorId === "housing")!.priceIndex).toBeLessThan(
      guarantee.sectors.find((row) => row.sectorId === "housing")!.priceIndex,
    );
    expect(formatIndex(costOfLivingIndex(loaded, 10, "MarketWages", 1))).toBe("0.639");
    expect(formatIndex(costOfLivingIndex(loaded, 10, "WageGuarantee", 1))).toBe("0.818");
    expect(formatUsd(18389.65)).toBe("$18,389.65");
    expect(formatIncomeUsd(81250)).toBe("$81,250");

    const series = householdBasketSeries(loaded, 1);
    expect(series.map((point) => point.year)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(series[0].marketWagesUsd).toBe(series[0].wageGuaranteeUsd);
    expect(series[10].marketWagesUsd).toBeLessThan(series[10].wageGuaranteeUsd);
    expect(series[10].marketWagesUsd).toBeLessThan(series[0].marketWagesUsd);

    const svg = basketChartSvg(series, 10, "WageGuarantee");
    expect(svg).not.toContain("NaN");
    expect(svg).toContain('data-year="10"');
    expect(svg).toMatch(/data-policy="WageGuarantee"[^>]*stroke-width="2.5"/);
    expect(svg).toMatch(/data-policy="MarketWages"[^>]*stroke-width="1.75"/);
    expect(polylinePoints(svg, "MarketWages")).toHaveLength(11);
    expect(polylinePoints(svg, "MarketWages")[0]).toBe(polylinePoints(svg, "WageGuarantee")[0]);
    expect(pointY(polylinePoints(svg, "MarketWages")[10])).toBeGreaterThan(pointY(polylinePoints(svg, "WageGuarantee")[10]));

    const lowIncome = householdPanelModel(loaded, { id: 4, incomeAnnualUsd: 10000 }, 5, 10, "MarketWages");
    const highIncome = householdPanelModel(loaded, { id: 9, incomeAnnualUsd: 200000 }, 5, 10, "MarketWages");
    expect(lowIncome.costUsd).toBe(highIncome.costUsd);
    expect(lowIncome.costUsd).toBe(basketCostUsd(loaded, 10, "MarketWages", 5));
    expect(lowIncome.series[10].wageGuaranteeUsd).toBeGreaterThan(lowIncome.series[10].marketWagesUsd);
    expect(lowIncome.colorHex).toBe(residenceColorHex(lowIncome.index));
  });
});

describe("cost-of-living color", () => {
  it("holds year 0 at a neutral gray and eases cheaper baskets toward green", () => {
    expect(residenceColorHex(1)).toBe("#8b949e");
    expect(residenceColorHex(0.2)).toBe(residenceColorHex(0.6));
    expect(residenceColorHex(2)).toBe(residenceColorHex(1.4));
    const channels = (hex: string) => {
      const value = Number.parseInt(hex.slice(1), 16);
      return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
    };
    const base = channels(residenceColorHex(1));
    const cheap = channels(residenceColorHex(0.64));
    const dear = channels(residenceColorHex(1.2));
    expect(cheap[1] / cheap[0]).toBeGreaterThan(base[1] / base[0]);
    expect(dear[0]).toBeGreaterThan(base[0]);
    expect(() => residenceColorHex(Number.NaN)).toThrow(/finite/);
  });
});

describe("view query", () => {
  it("opens year 0 and MarketWages unless the query names a real control", () => {
    expect(initialViewSelection("")).toEqual({ year: 0, wagePolicy: "MarketWages", householdId: null });
    expect(initialViewSelection("?year=10&policy=WageGuarantee&household=12")).toEqual({
      year: 10,
      wagePolicy: "WageGuarantee",
      householdId: 12,
    });
    expect(initialViewSelection("?year=11&policy=nope&household=-3")).toEqual({
      year: 0,
      wagePolicy: "MarketWages",
      householdId: null,
    });
  });
});

describe("household income fifths and residence layout", () => {
  let world: M2aWorld;
  let loaded: LoadedSectorRoadmap;

  beforeAll(() => {
    world = buildM2aWorld(42);
    loaded = loadSectorRoadmap(JSON.parse(readFileSync("data/sector-roadmap.json", "utf8")));
  });

  it("ranks households the way the town sim does", () => {
    const sample = [household(2, 10), household(0, 50), household(1, 30), household(3, 70), household(4, 90)];
    const fifths = mapHouseholdsToIncomeFifths(sample);
    expect(fifths).toEqual(assignHouseholdIncomeQuintiles(sample));
    expect(fifths.get(2)).toBe(1);
    expect(fifths.get(4)).toBe(5);

    const tiedFirst = [household(8, 10), household(7, 10), household(1, 40), household(2, 60), household(3, 80)];
    const tiedSecond = [household(7, 10), household(8, 10), household(1, 40), household(2, 60), household(3, 80)];
    expect(mapHouseholdsToIncomeFifths(tiedFirst).get(8)).toBe(1);
    expect(mapHouseholdsToIncomeFifths(tiedSecond).get(7)).toBe(1);
    expect(mapHouseholdsToIncomeFifths(tiedFirst)).toEqual(assignHouseholdIncomeQuintiles(tiedFirst));

    const ranked = mapHouseholdsToIncomeFifths(world.households);
    expect(ranked).toEqual(assignHouseholdIncomeQuintiles(world.households));
    const counts = [0, 0, 0, 0, 0, 0];
    for (const quintile of ranked.values()) counts[quintile] += 1;
    const sizes = counts.slice(1);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    const byIncome = [...world.households].sort((a, b) => a.incomeAnnualUsd - b.incomeAnnualUsd);
    expect(ranked.get(byIncome[0].id)).toBe(1);
    expect(ranked.get(byIncome[byIncome.length - 1].id)).toBe(5);

    for (const hh of world.households) {
      const quintile = ranked.get(hh.id);
      expect(quintile).toBeDefined();
      const index = costOfLivingIndex(loaded, 10, "MarketWages", quintile!);
      expect(index).toBeGreaterThan(0);
      expect(index).toBeLessThan(1);
      expect(residenceColorHex(costOfLivingIndex(loaded, 0, "MarketWages", quintile!))).toBe("#8b949e");
    }
    expect(() => mapHouseholdsToIncomeFifths([household(1, 10), household(1, 20)])).toThrow(/unique/);
  });

  it("places each household on its own cell west of the work region", () => {
    expect(layoutHouseholdResidences([])).toEqual([]);
    expect(layoutHouseholdResidences([4, 1, 2]).map((plot) => [plot.householdId, plot.x, plot.y])).toEqual([
      [1, 1, 1],
      [2, 2, 1],
      [4, 1, 2],
    ]);
    expect(layoutHouseholdResidences([3, 1, 2])).toEqual(layoutHouseholdResidences([1, 2, 3]));
    expect(() => layoutHouseholdResidences([1, 1])).toThrow(/unique/);

    const plots = layoutHouseholdResidences(world.households.map((hh) => hh.id));
    expect(plots).toHaveLength(world.households.length);
    expect(new Set(plots.map((plot) => `${plot.x},${plot.y}`)).size).toBe(plots.length);
    const minId = Math.min(...world.households.map((hh) => hh.id));
    expect(plots[0]).toMatchObject({ householdId: minId, x: 1, y: 1 });
    for (const plot of plots) {
      expect(plot.x).toBeGreaterThanOrEqual(1);
      expect(plot.x).toBeLessThan(WORK_REGION.x0);
      expect(plot.y).toBeGreaterThanOrEqual(1);
      expect(plot.y).toBeLessThan(MAP_SIZE);
    }
  });
});
