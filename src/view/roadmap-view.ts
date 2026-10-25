import roadmapFile from "../../data/sector-roadmap.json" with { type: "json" };
import type { WagePolicyName } from "../economy/m2a/wage-policy.js";
import type { IncomeFifth } from "../economy/sectors/cost-of-living.js";
import { MAP_SIZE, WORK_REGION } from "../sim/config.js";
import { assignHouseholdIncomeQuintiles } from "../sim/m2a/distribution.js";
import type { Household } from "../sim/m2a/types.js";

/**
 * The town view reads the published series. It does not call
 * `buildSectorRoadmap` or the sector P&L, so the picture stays on the
 * numbers already written to data/sector-roadmap.json.
 */
export const ROADMAP_SCHEMA = "abundance-city.sector-roadmap.v1";

export const PANEL_SECTORS = [
  "housing",
  "food",
  "utilities",
  "transport",
  "insurance",
  "healthcare",
] as const;

export type PanelSectorId = (typeof PANEL_SECTORS)[number];

const SECTOR_LABELS: Record<PanelSectorId, string> = {
  housing: "Housing",
  food: "Food",
  utilities: "Utilities",
  transport: "Transport",
  insurance: "Insurance",
  healthcare: "Healthcare",
};

const FIFTH_LABELS: Record<IncomeFifth, string> = {
  1: "Lowest",
  2: "Second",
  3: "Third",
  4: "Fourth",
  5: "Highest",
};

export const POLICY_COLORS: Record<WagePolicyName, string> = {
  MarketWages: "#79c0ff",
  WageGuarantee: "#d2a8ff",
};

const WAGE_POLICIES: readonly WagePolicyName[] = ["MarketWages", "WageGuarantee"];
const INCOME_FIFTHS: readonly IncomeFifth[] = [1, 2, 3, 4, 5];
const YEARS = Array.from({ length: 11 }, (_, year) => year);

/** Year-0 color. Indexes below 1 ease toward this muted green; above 1, toward the warm tone. */
const BASELINE_RGB = { r: 0x8b, g: 0x94, b: 0x9e };
const CHEAPER_RGB = { r: 0x3d, g: 0x7a, b: 0x5a };
const DEARER_RGB = { r: 0xa6, g: 0x6d, b: 0x5a };
/** Distance from 1 at which the mix reaches its limit. Year 10 sits near 0.64. */
const COLOR_RAMP = 0.4;
/** Cap the mix so a cheap basket stays a gray-green rather than a saturated green. */
const COLOR_MIX = 0.55;

export interface LoadedSectorRoadmap {
  years: readonly number[];
  wagePolicies: readonly WagePolicyName[];
  quintiles: readonly IncomeFifth[];
  sectorsInCostOfLiving: readonly string[];
  priceByKey: ReadonlyMap<string, number>;
  basketByKey: ReadonlyMap<string, number>;
}

export interface ResidencePlot {
  householdId: number;
  x: number;
  y: number;
}

export interface SectorPriceRow {
  sectorId: PanelSectorId;
  label: string;
  priceIndex: number;
  priceText: string;
}

export interface FifthBasketRow {
  quintile: IncomeFifth;
  label: string;
  costUsd: number;
  costText: string;
  index: number;
  indexText: string;
}

export interface SidePanelModel {
  year: number;
  wagePolicy: WagePolicyName;
  sectors: SectorPriceRow[];
  fifths: FifthBasketRow[];
}

export interface BasketChartPoint {
  year: number;
  marketWagesUsd: number;
  wageGuaranteeUsd: number;
}

export interface HouseholdPanelModel {
  householdId: number;
  incomeAnnualUsd: number;
  quintile: IncomeFifth;
  quintileLabel: string;
  year: number;
  wagePolicy: WagePolicyName;
  costUsd: number;
  costText: string;
  index: number;
  indexText: string;
  colorHex: string;
  series: BasketChartPoint[];
  chartSvg: string;
}

export interface ViewSelection {
  year: number;
  wagePolicy: WagePolicyName;
  householdId: number | null;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function assertObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function sameList<T>(actual: readonly T[], expected: readonly T[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function priceKey(sectorId: string, year: number, wagePolicy: WagePolicyName): string {
  return `${sectorId}|${year}|${wagePolicy}`;
}

function basketKey(year: number, wagePolicy: WagePolicyName, quintile: IncomeFifth): string {
  return `${year}|${wagePolicy}|${quintile}`;
}

function isWagePolicy(value: unknown): value is WagePolicyName {
  return value === "MarketWages" || value === "WageGuarantee";
}

function isIncomeFifth(value: unknown): value is IncomeFifth {
  return value === 1 || value === 2 || value === 3 || value === 4 || value === 5;
}

function requireYear(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 10) {
    throw new Error(`${what} must be an integer year in 0..10`);
  }
  return value;
}

function requireFinite(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${what} must be a finite number`);
  }
  return value;
}

function rgbHex(rgb: Rgb): string {
  const channel = (value: number) => value.toString(16).padStart(2, "0");
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

export function loadBundledSectorRoadmap(): LoadedSectorRoadmap {
  return loadSectorRoadmap(roadmapFile);
}

export function loadSectorRoadmap(raw: unknown): LoadedSectorRoadmap {
  const data = assertObject(raw, "Sector roadmap");
  if (data.schema !== ROADMAP_SCHEMA) {
    throw new Error(`Unknown sector roadmap schema: ${String(data.schema)}`);
  }
  if (!Array.isArray(data.years) || !sameList(data.years, YEARS)) {
    throw new Error("Sector roadmap years must be 0..10");
  }
  if (!Array.isArray(data.wagePolicies) || !sameList(data.wagePolicies, WAGE_POLICIES)) {
    throw new Error("Sector roadmap wage policies must be MarketWages, WageGuarantee");
  }
  if (!Array.isArray(data.quintiles) || !sameList(data.quintiles, INCOME_FIFTHS)) {
    throw new Error("Sector roadmap quintiles must be 1..5");
  }
  if (!Array.isArray(data.sectorsInCostOfLiving) || data.sectorsInCostOfLiving.some((id) => typeof id !== "string")) {
    throw new Error("Sector roadmap sectorsInCostOfLiving must be a list of ids");
  }
  const sectorsInCostOfLiving = data.sectorsInCostOfLiving as string[];
  for (const sectorId of PANEL_SECTORS) {
    if (!sectorsInCostOfLiving.includes(sectorId)) {
      throw new Error(`Sector roadmap is missing ${sectorId} in the cost of living`);
    }
  }

  const priceByKey = new Map<string, number>();
  if (!Array.isArray(data.pnl)) throw new Error("Sector roadmap pnl must be an array");
  for (const entry of data.pnl) {
    const row = assertObject(entry, "P&L row");
    if (typeof row.sectorId !== "string" || row.sectorId.length === 0) {
      throw new Error("P&L row is missing sectorId");
    }
    const year = requireYear(row.year, "P&L year");
    if (!isWagePolicy(row.wagePolicy)) throw new Error(`P&L row has an unknown wage policy: ${String(row.wagePolicy)}`);
    const priceIndex = requireFinite(row.priceIndex, `Price index for ${row.sectorId}`);
    const key = priceKey(row.sectorId, year, row.wagePolicy);
    if (priceByKey.has(key)) throw new Error(`Duplicate price row for ${key}`);
    priceByKey.set(key, priceIndex);
  }

  const basketByKey = new Map<string, number>();
  if (!Array.isArray(data.costOfLiving)) throw new Error("Sector roadmap costOfLiving must be an array");
  for (const entry of data.costOfLiving) {
    const row = assertObject(entry, "Cost-of-living row");
    const year = requireYear(row.year, "Cost-of-living year");
    if (!isWagePolicy(row.wagePolicy)) {
      throw new Error(`Cost-of-living row has an unknown wage policy: ${String(row.wagePolicy)}`);
    }
    if (!isIncomeFifth(row.quintile)) {
      throw new Error(`Cost-of-living row has an unknown income fifth: ${String(row.quintile)}`);
    }
    const cost = requireFinite(row.costOfLivingUsd, "Cost of living");
    if (cost <= 0) throw new Error(`Cost of living must stay positive (year ${year} ${row.wagePolicy} Q${row.quintile})`);
    const key = basketKey(year, row.wagePolicy, row.quintile);
    if (basketByKey.has(key)) throw new Error(`Duplicate cost-of-living row for ${key}`);
    basketByKey.set(key, cost);
  }

  const loaded: LoadedSectorRoadmap = {
    years: YEARS,
    wagePolicies: WAGE_POLICIES,
    quintiles: INCOME_FIFTHS,
    sectorsInCostOfLiving,
    priceByKey,
    basketByKey,
  };

  for (const year of YEARS) {
    for (const wagePolicy of WAGE_POLICIES) {
      for (const sectorId of PANEL_SECTORS) {
        sectorPriceIndex(loaded, sectorId, year, wagePolicy);
      }
      for (const quintile of INCOME_FIFTHS) {
        basketCostUsd(loaded, year, wagePolicy, quintile);
      }
    }
  }

  return loaded;
}

export function sectorPriceIndex(
  loaded: LoadedSectorRoadmap,
  sectorId: string,
  year: number,
  wagePolicy: WagePolicyName,
): number {
  const price = loaded.priceByKey.get(priceKey(sectorId, year, wagePolicy));
  if (price === undefined) {
    throw new Error(`Missing price index for ${sectorId} year ${year} ${wagePolicy}`);
  }
  return price;
}

export function basketCostUsd(
  loaded: LoadedSectorRoadmap,
  year: number,
  wagePolicy: WagePolicyName,
  quintile: IncomeFifth,
): number {
  const cost = loaded.basketByKey.get(basketKey(year, wagePolicy, quintile));
  if (cost === undefined) {
    throw new Error(`Missing cost of living for year ${year} ${wagePolicy} Q${quintile}`);
  }
  return cost;
}

/** Basket in the selected year divided by the same policy and fifth at year 0. */
export function costOfLivingIndex(
  loaded: LoadedSectorRoadmap,
  year: number,
  wagePolicy: WagePolicyName,
  quintile: IncomeFifth,
): number {
  const base = basketCostUsd(loaded, 0, wagePolicy, quintile);
  const current = basketCostUsd(loaded, year, wagePolicy, quintile);
  return current / base;
}

/**
 * Equal-count income fifths, lowest first.
 *
 * This is the town sim's ranking (`assignHouseholdIncomeQuintiles`):
 * sort by ACS annual income, then `min(5, floor(i * 5 / n) + 1)`.
 * The sort is stable and compares income only, so equal incomes keep
 * their original order. The roadmap has no household-level basket, so
 * every household in a fifth uses that fifth's series.
 */
export function mapHouseholdsToIncomeFifths(households: readonly Household[]): Map<number, IncomeFifth> {
  const ranked = assignHouseholdIncomeQuintiles([...households]);
  if (ranked.size !== households.length) {
    throw new Error("Household ids must be unique");
  }
  const out = new Map<number, IncomeFifth>();
  for (const [id, quintile] of ranked) {
    if (!isIncomeFifth(quintile)) throw new Error(`Income fifth out of range for household ${id}: ${quintile}`);
    out.set(id, quintile);
  }
  return out;
}

/**
 * Display layout for the town view. The town file stores no street address.
 * Residences are drawn in ascending household id, one cell each, row-major
 * from grid (1, 1). The block stays on the 32×32 map and west of the work
 * region. It is a picture of the households, separate from the commute sim.
 */
export function layoutHouseholdResidences(
  householdIds: readonly number[],
  mapSize = MAP_SIZE,
): ResidencePlot[] {
  if (householdIds.length === 0) return [];
  const ids = [...householdIds].sort((a, b) => a - b);
  if (new Set(ids).size !== ids.length) throw new Error("Household ids must be unique");

  const origin = 1;
  const maxX = Math.min(mapSize - 2, WORK_REGION.x0 - 2);
  const colsAvailable = maxX - origin + 1;
  const rowsAvailable = mapSize - 2 - origin + 1;
  if (colsAvailable < 1 || rowsAvailable < 1) {
    throw new Error(`Map has no room for residences (${mapSize})`);
  }
  const cols = Math.min(colsAvailable, Math.max(1, Math.ceil(Math.sqrt(ids.length))));
  const rowsNeeded = Math.ceil(ids.length / cols);
  if (rowsNeeded > rowsAvailable) {
    throw new Error(`Cannot place ${ids.length} residences on a ${mapSize} map`);
  }

  return ids.map((householdId, index) => ({
    householdId,
    x: origin + (index % cols),
    y: origin + Math.floor(index / cols),
  }));
}

export function residenceColorHex(index: number): string {
  if (!Number.isFinite(index)) throw new Error(`Cost-of-living index must be finite, got ${index}`);
  if (index === 1) return rgbHex(BASELINE_RGB);
  const toward = index < 1 ? CHEAPER_RGB : DEARER_RGB;
  const t = Math.min(1, Math.abs(index - 1) / COLOR_RAMP) * COLOR_MIX;
  return rgbHex({
    r: Math.round(BASELINE_RGB.r + (toward.r - BASELINE_RGB.r) * t),
    g: Math.round(BASELINE_RGB.g + (toward.g - BASELINE_RGB.g) * t),
    b: Math.round(BASELINE_RGB.b + (toward.b - BASELINE_RGB.b) * t),
  });
}

export function formatUsd(usd: number): string {
  const cents = Math.round(usd * 100);
  const whole = cents % 100 === 0;
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

export function formatIndex(index: number): string {
  return index.toFixed(3);
}

export function formatIncomeUsd(usd: number): string {
  return Math.round(usd).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function sidePanelModel(
  loaded: LoadedSectorRoadmap,
  year: number,
  wagePolicy: WagePolicyName,
): SidePanelModel {
  return {
    year,
    wagePolicy,
    sectors: PANEL_SECTORS.map((sectorId) => {
      const priceIndex = sectorPriceIndex(loaded, sectorId, year, wagePolicy);
      return {
        sectorId,
        label: SECTOR_LABELS[sectorId],
        priceIndex,
        priceText: formatIndex(priceIndex),
      };
    }),
    fifths: INCOME_FIFTHS.map((quintile) => {
      const costUsd = basketCostUsd(loaded, year, wagePolicy, quintile);
      const index = costOfLivingIndex(loaded, year, wagePolicy, quintile);
      return {
        quintile,
        label: FIFTH_LABELS[quintile],
        costUsd,
        costText: formatUsd(costUsd),
        index,
        indexText: formatIndex(index),
      };
    }),
  };
}

export function householdBasketSeries(loaded: LoadedSectorRoadmap, quintile: IncomeFifth): BasketChartPoint[] {
  return loaded.years.map((year) => ({
    year,
    marketWagesUsd: basketCostUsd(loaded, year, "MarketWages", quintile),
    wageGuaranteeUsd: basketCostUsd(loaded, year, "WageGuarantee", quintile),
  }));
}

export function householdPanelModel(
  loaded: LoadedSectorRoadmap,
  household: { id: number; incomeAnnualUsd: number },
  quintile: IncomeFifth,
  year: number,
  wagePolicy: WagePolicyName,
): HouseholdPanelModel {
  const series = householdBasketSeries(loaded, quintile);
  const costUsd = basketCostUsd(loaded, year, wagePolicy, quintile);
  const index = costOfLivingIndex(loaded, year, wagePolicy, quintile);
  return {
    householdId: household.id,
    incomeAnnualUsd: household.incomeAnnualUsd,
    quintile,
    quintileLabel: FIFTH_LABELS[quintile],
    year,
    wagePolicy,
    costUsd,
    costText: formatUsd(costUsd),
    index,
    indexText: formatIndex(index),
    colorHex: residenceColorHex(index),
    series,
    chartSvg: basketChartSvg(series, year, wagePolicy),
  };
}

function formatAxisUsd(usd: number): string {
  return `$${(usd / 1000).toFixed(1)}k`;
}

/**
 * Two polylines, one per wage policy. Y grows downward, so a cheaper basket sits lower on the chart.
 */
export function basketChartSvg(
  series: readonly BasketChartPoint[],
  highlightYear: number,
  emphasized: WagePolicyName = "MarketWages",
): string {
  if (series.length < 2) throw new Error("Basket chart needs at least two years");
  const values = series.flatMap((point) => [point.marketWagesUsd, point.wageGuaranteeUsd]);
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Basket chart values must be finite");
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const span = max - min;
  const plotMin = min - span * 0.08;
  const plotMax = max + span * 0.08;
  const width = 300;
  const height = 148;
  const padLeft = 48;
  const padRight = 10;
  const padTop = 12;
  const padBottom = 22;
  const innerW = width - padLeft - padRight;
  const innerH = height - padTop - padBottom;
  const firstYear = series[0].year;
  const lastYear = series[series.length - 1].year;
  const yearSpan = lastYear - firstYear || 1;
  const xOf = (year: number) => padLeft + ((year - firstYear) / yearSpan) * innerW;
  const yOf = (usd: number) => padTop + (1 - (usd - plotMin) / (plotMax - plotMin)) * innerH;
  const market = series.map((point) => ({ x: xOf(point.year), y: yOf(point.marketWagesUsd) }));
  const guarantee = series.map((point) => ({ x: xOf(point.year), y: yOf(point.wageGuaranteeUsd) }));
  const attr = (points: { x: number; y: number }[]) => points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  const widthFor = (policy: WagePolicyName) => (policy === emphasized ? "2.5" : "1.75");
  const highlight = series.some((point) => point.year === highlightYear)
    ? `<line data-year="${highlightYear}" x1="${xOf(highlightYear).toFixed(1)}" y1="${padTop}" x2="${xOf(highlightYear).toFixed(1)}" y2="${padTop + innerH}" stroke="#8b949e" stroke-width="1" stroke-dasharray="3 3" />`
    : "";
  const axisY = padTop + innerH;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Household basket cost over ten years under both wage policies">`,
    `<line x1="${padLeft}" y1="${axisY}" x2="${width - padRight}" y2="${axisY}" stroke="#30363d" stroke-width="1" />`,
    highlight,
    `<polyline data-policy="MarketWages" fill="none" stroke="${POLICY_COLORS.MarketWages}" stroke-width="${widthFor("MarketWages")}" points="${attr(market)}" />`,
    `<polyline data-policy="WageGuarantee" fill="none" stroke="${POLICY_COLORS.WageGuarantee}" stroke-width="${widthFor("WageGuarantee")}" points="${attr(guarantee)}" />`,
    `<text x="${padLeft}" y="${height - 6}" fill="#8b949e" font-size="11" font-family="system-ui, sans-serif">${firstYear}</text>`,
    `<text x="${width - padRight}" y="${height - 6}" fill="#8b949e" font-size="11" font-family="system-ui, sans-serif" text-anchor="end">${lastYear}</text>`,
    `<text x="${padLeft - 6}" y="${yOf(max) + 4}" fill="#8b949e" font-size="11" font-family="system-ui, sans-serif" text-anchor="end">${formatAxisUsd(max)}</text>`,
    `<text x="${padLeft - 6}" y="${yOf(min) + 4}" fill="#8b949e" font-size="11" font-family="system-ui, sans-serif" text-anchor="end">${formatAxisUsd(min)}</text>`,
    `</svg>`,
  ].join("");
}

/** Initial controls from the page query. Unknown values fall back to year 0 and MarketWages. */
export function initialViewSelection(search: string): ViewSelection {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const yearRaw = params.get("year");
  let year = 0;
  if (yearRaw !== null && yearRaw !== "") {
    const parsed = Number(yearRaw);
    if (Number.isInteger(parsed) && parsed >= 0 && parsed <= 10) year = parsed;
  }
  const policyRaw = params.get("policy");
  const wagePolicy: WagePolicyName = isWagePolicy(policyRaw) ? policyRaw : "MarketWages";
  const householdRaw = params.get("household");
  let householdId: number | null = null;
  if (householdRaw !== null && householdRaw !== "") {
    const parsed = Number(householdRaw);
    if (Number.isInteger(parsed) && parsed >= 0) householdId = parsed;
  }
  return { year, wagePolicy, householdId };
}
