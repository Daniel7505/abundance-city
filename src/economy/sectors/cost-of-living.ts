import sources from "../../../data/sources.json" with { type: "json" };
import sectorConfig from "../../../data/sectors.json" with { type: "json" };
import type { WagePolicyName } from "../m2a/wage-policy.js";
import { housingDwellingRentParameters } from "./parameters.js";
import { sectorYearPnL, type SectorCostParameters } from "./pnl.js";

export const INCOME_FIFTHS = [1, 2, 3, 4, 5] as const;
export type IncomeFifth = (typeof INCOME_FIFTHS)[number];

export interface SectorCompositionPart {
  item: string;
  sign: 1 | -1;
}

export interface SectorDefinition {
  id: string;
  label: string;
  inCostOfLiving: boolean;
  composition: SectorCompositionPart[];
  parameters: SectorCostParameters;
}

interface SectorFileEntry {
  id: string;
  label: string;
  inCostOfLiving: boolean;
  composition: SectorCompositionPart[];
  costModel?: string;
  parameters?: SectorCostParameters;
}

const quintileItems = sources.consumerExpenditure.quintilesOfIncomeBeforeTaxes.itemsUsd as Record<
  string,
  { series: string; usd: number[] }
>;

export function expenditureMeansUsd(item: string): number[] {
  const row = quintileItems[item];
  if (!row) throw new Error(`Unknown expenditure item: ${item}`);
  return row.usd;
}

/** Table 1101 share: item mean / average annual expenditures, in percent, half up to 0.1. */
export function expenditureSharePercent(itemUsd: number, totalUsd: number): number {
  if (totalUsd === 0) return 0;
  return Math.round((itemUsd / totalUsd) * 1000) / 10;
}

export function sectorParameters(entry: SectorFileEntry): SectorCostParameters {
  if (entry.costModel === "housingDwellingRent") return housingDwellingRentParameters();
  if (!entry.parameters) throw new Error(`Sector ${entry.id} has no cost parameters`);
  return entry.parameters;
}

export function sectorDefinitions(): SectorDefinition[] {
  return (sectorConfig.sectors as SectorFileEntry[]).map((entry) => ({
    id: entry.id,
    label: entry.label,
    inCostOfLiving: entry.inCostOfLiving,
    composition: entry.composition,
    parameters: sectorParameters(entry),
  }));
}

/** Year-0 dollars for one sector and one income fifth (1 = lowest). */
export function sectorBaselineUsd(sector: SectorDefinition, quintile: IncomeFifth): number {
  let sum = 0;
  for (const part of sector.composition) {
    sum += part.sign * expenditureMeansUsd(part.item)[quintile - 1];
  }
  return sum;
}

export function abundanceAtYear(year: number, horizonYears = sectorConfig.horizonYears): number {
  if (!Number.isInteger(year) || year < 0 || year > horizonYears) {
    throw new Error(`Year must be an integer in 0..${horizonYears}, got ${year}`);
  }
  return year / horizonYears;
}

export interface CostOfLivingYear {
  year: number;
  abundance: number;
  wagePolicy: WagePolicyName;
  quintile: IncomeFifth;
  /** Basket cost in dollars, rounded half up to the cent. */
  costOfLivingUsd: number;
  bySectorUsd: Record<string, number>;
}

export interface SectorPnLPoint {
  sectorId: string;
  year: number;
  wagePolicy: WagePolicyName;
  outputIndex: number;
  unitCostIndex: number;
  laborShare: number;
  wageBillIndex: number;
  wageTopUpIndex: number;
  priceIndex: number;
  revenueIndex: number;
  surplusIndex: number;
}

export interface SectorRoadmapSeries {
  schema: "abundance-city.sector-roadmap.v1";
  years: number[];
  wagePolicies: WagePolicyName[];
  quintiles: IncomeFifth[];
  sectorsInCostOfLiving: string[];
  pnl: SectorPnLPoint[];
  costOfLiving: CostOfLivingYear[];
}

function roundCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

const WAGE_POLICIES: WagePolicyName[] = ["MarketWages", "WageGuarantee"];

/**
 * Ten-year sector accounts and the cost of each income fifth's verified basket.
 * Flat records, one per year, so a later time slider can filter on year.
 */
export function buildSectorRoadmap(): SectorRoadmapSeries {
  const sectors = sectorDefinitions();
  const horizon = sectorConfig.horizonYears;
  const years = Array.from({ length: horizon + 1 }, (_, year) => year);
  const pnl: SectorPnLPoint[] = [];
  const costOfLiving: CostOfLivingYear[] = [];

  for (const year of years) {
    const abundance = abundanceAtYear(year, horizon);
    const priceBySector = new Map<WagePolicyName, Map<string, number>>();
    for (const wagePolicy of WAGE_POLICIES) {
      const prices = new Map<string, number>();
      for (const sector of sectors) {
        const row = sectorYearPnL(abundance, wagePolicy, sector.parameters);
        prices.set(sector.id, row.priceIndex);
        pnl.push({
          sectorId: sector.id,
          year,
          wagePolicy,
          outputIndex: row.outputIndex,
          unitCostIndex: row.unitCostIndex,
          laborShare: row.laborShare,
          wageBillIndex: row.wageBillIndex,
          wageTopUpIndex: row.wageTopUpIndex,
          priceIndex: row.priceIndex,
          revenueIndex: row.revenueIndex,
          surplusIndex: row.surplusIndex,
        });
      }
      priceBySector.set(wagePolicy, prices);
    }

    for (const wagePolicy of WAGE_POLICIES) {
      const prices = priceBySector.get(wagePolicy)!;
      for (const quintile of INCOME_FIFTHS) {
        const bySectorUsd: Record<string, number> = {};
        let total = 0;
        for (const sector of sectors) {
          if (!sector.inCostOfLiving) continue;
          const dollars = sectorBaselineUsd(sector, quintile) * prices.get(sector.id)!;
          bySectorUsd[sector.id] = roundCents(dollars);
          total += dollars;
        }
        costOfLiving.push({
          year,
          abundance,
          wagePolicy,
          quintile,
          costOfLivingUsd: roundCents(total),
          bySectorUsd,
        });
      }
    }
  }

  return {
    schema: "abundance-city.sector-roadmap.v1",
    years,
    wagePolicies: WAGE_POLICIES,
    quintiles: [...INCOME_FIFTHS],
    sectorsInCostOfLiving: sectors.filter((s) => s.inCostOfLiving).map((s) => s.id),
    pnl,
    costOfLiving,
  };
}

export function costOfLivingPoint(
  series: SectorRoadmapSeries,
  year: number,
  wagePolicy: WagePolicyName,
  quintile: IncomeFifth,
): CostOfLivingYear {
  const row = series.costOfLiving.find(
    (point) => point.year === year && point.wagePolicy === wagePolicy && point.quintile === quintile,
  );
  if (!row) throw new Error(`Missing cost of living for year ${year} ${wagePolicy} Q${quintile}`);
  return row;
}
