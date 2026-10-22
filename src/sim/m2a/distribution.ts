import type { DailySettlementResult } from "../../economy/m2a/daily.js";
import type { Household, M2aWorld } from "./types.js";

export const QUINTILE_COUNT = 5;
export const MAX_TRAILING_PROBE_DAYS = 90;

export interface QuintileDistributionBucket {
  quintile: number;
  households: number;
  wageIncomeCents: number;
  transferIncomeCents: number;
  needsCents: number;
  housingNeedsCents: number;
  foodNeedsCents: number;
  electricityNeedsCents: number;
  /** Trailing mean needs / trailing mean disposable inflow. */
  needsShareOfIncome: number;
  /** Trailing mean housing / trailing mean total needs. */
  housingShareOfNeeds: number;
}

export interface IndustryDistributionSnapshot {
  industryIndex: number;
  priceCents: number;
  jobs: number;
  laborHours: number;
  wagesPaidCents: number;
}

export interface HouseholdTrailingDay {
  wageCents: number;
  transferCents: number;
  disposableCents: number;
  needsCents: number;
  housingNeedsCents: number;
  foodNeedsCents: number;
  electricityNeedsCents: number;
  nonWageDisposableCents: number;
}

export function assignHouseholdIncomeQuintiles(households: Household[]): Map<number, number> {
  const sorted = [...households].sort((a, b) => a.incomeAnnualUsd - b.incomeAnnualUsd);
  const n = sorted.length;
  const out = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const quintile = Math.min(QUINTILE_COUNT, Math.floor((i * QUINTILE_COUNT) / n) + 1);
    out.set(sorted[i].id, quintile);
  }
  return out;
}

function trailingMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function pushTrailingDay(
  window: HouseholdTrailingDay[],
  day: HouseholdTrailingDay,
  maxLen: number,
): void {
  window.push(day);
  if (window.length > maxLen) window.shift();
}

export function householdCoverageRatio(window: HouseholdTrailingDay[], windowDays: number): number {
  const slice = window.slice(-windowDays);
  if (slice.length === 0) return 0;
  const sumNonWage = slice.reduce((s, d) => s + d.nonWageDisposableCents, 0);
  const sumNeeds = slice.reduce((s, d) => s + d.needsCents, 0);
  if (sumNeeds <= 0) return sumNonWage > 0 ? Infinity : 0;
  return sumNonWage / sumNeeds;
}

export function workOptionalShareForWindow(
  world: M2aWorld,
  householdWindows: Map<number, HouseholdTrailingDay[]>,
  windowDays: number,
  m2bEnabled: boolean,
): number {
  let optional = 0;
  for (const hh of world.households) {
    const hasAutomationEmployment =
      m2bEnabled &&
      hh.agentIds.some((id) => {
        const a = world.agents[id];
        return a.laborStatus === "employed" && !a.demandSlotEmployment;
      });
    if (hasAutomationEmployment) continue;
    const window = householdWindows.get(hh.id);
    if (!window || window.length === 0) continue;
    const ratio = householdCoverageRatio(window, windowDays);
    if (ratio >= 1) optional += 1;
  }
  return optional / world.households.length;
}

/** Decile edges 0–1 of coverage ratio (non-wage disposable / needs) across households. */
export function coverageRatioDeciles(
  world: M2aWorld,
  householdWindows: Map<number, HouseholdTrailingDay[]>,
  windowDays: number,
  m2bEnabled: boolean,
): number[] {
  const ratios: number[] = [];
  for (const hh of world.households) {
    const hasAutomationEmployment =
      m2bEnabled &&
      hh.agentIds.some((id) => {
        const a = world.agents[id];
        return a.laborStatus === "employed" && !a.demandSlotEmployment;
      });
    if (hasAutomationEmployment) continue;
    const window = householdWindows.get(hh.id);
    if (!window || window.length === 0) continue;
    ratios.push(householdCoverageRatio(window, windowDays));
  }
  ratios.sort((a, b) => a - b);
  if (ratios.length === 0) return Array.from({ length: 10 }, () => 0);
  const deciles: number[] = [];
  for (let d = 1; d <= 10; d++) {
    const idx = Math.min(ratios.length - 1, Math.ceil((d / 10) * ratios.length) - 1);
    deciles.push(ratios[idx]);
  }
  return deciles;
}

export function aggregateQuintileDistribution(
  world: M2aWorld,
  quintileByHousehold: Map<number, number>,
  householdWindows: Map<number, HouseholdTrailingDay[]>,
  windowDays: number,
): QuintileDistributionBucket[] {
  const buckets: QuintileDistributionBucket[] = Array.from({ length: QUINTILE_COUNT }, (_, i) => ({
    quintile: i + 1,
    households: 0,
    wageIncomeCents: 0,
    transferIncomeCents: 0,
    needsCents: 0,
    housingNeedsCents: 0,
    foodNeedsCents: 0,
    electricityNeedsCents: 0,
    needsShareOfIncome: 0,
    housingShareOfNeeds: 0,
  }));

  for (const hh of world.households) {
    const q = quintileByHousehold.get(hh.id) ?? 1;
    const bucket = buckets[q - 1];
    bucket.households += 1;
    const window = householdWindows.get(hh.id) ?? [];
    const slice = window.slice(-windowDays);
    const wage = trailingMean(slice.map((d) => d.wageCents));
    const transfer = trailingMean(slice.map((d) => d.transferCents));
    const needs = trailingMean(slice.map((d) => d.needsCents));
    const housing = trailingMean(slice.map((d) => d.housingNeedsCents));
    const food = trailingMean(slice.map((d) => d.foodNeedsCents));
    const electricity = trailingMean(slice.map((d) => d.electricityNeedsCents));
    const disposable = trailingMean(slice.map((d) => d.disposableCents));
    bucket.wageIncomeCents += wage;
    bucket.transferIncomeCents += transfer;
    bucket.needsCents += needs;
    bucket.housingNeedsCents += housing;
    bucket.foodNeedsCents += food;
    bucket.electricityNeedsCents += electricity;
    bucket.needsShareOfIncome += disposable > 0 ? needs / disposable : 0;
    bucket.housingShareOfNeeds += needs > 0 ? housing / needs : 0;
  }

  for (const bucket of buckets) {
    if (bucket.households > 0) {
      bucket.needsShareOfIncome /= bucket.households;
      bucket.housingShareOfNeeds /= bucket.households;
    }
  }
  return buckets;
}

export function industryDistributionFromSettlement(
  settlement: DailySettlementResult,
): IndustryDistributionSnapshot[] {
  return settlement.byIndustry.map((row, industryIndex) => ({
    industryIndex,
    priceCents: settlement.pricesCents[industryIndex] ?? 0,
    jobs: row.jobs,
    laborHours: row.output,
    wagesPaidCents: row.wages,
  }));
}

export function sumQuintileField(
  buckets: QuintileDistributionBucket[],
  field: keyof Pick<
    QuintileDistributionBucket,
    "wageIncomeCents" | "transferIncomeCents" | "needsCents" | "housingNeedsCents"
  >,
): number {
  return buckets.reduce((s, b) => s + b[field], 0);
}

export function householdTrailingTotals(
  world: M2aWorld,
  householdWindows: Map<number, HouseholdTrailingDay[]>,
  windowDays: number,
): {
  wageCents: number;
  transferCents: number;
  needsCents: number;
  housingNeedsCents: number;
} {
  let wageCents = 0;
  let transferCents = 0;
  let needsCents = 0;
  let housingNeedsCents = 0;
  for (const hh of world.households) {
    const slice = (householdWindows.get(hh.id) ?? []).slice(-windowDays);
    wageCents += trailingMean(slice.map((d) => d.wageCents));
    transferCents += trailingMean(slice.map((d) => d.transferCents));
    needsCents += trailingMean(slice.map((d) => d.needsCents));
    housingNeedsCents += trailingMean(slice.map((d) => d.housingNeedsCents));
  }
  return { wageCents, transferCents, needsCents, housingNeedsCents };
}
