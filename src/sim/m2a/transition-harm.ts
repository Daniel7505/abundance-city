import { assignHouseholdIncomeQuintiles } from "./distribution.js";
import type { M2aWorld } from "./types.js";

/** A transition year is 365 days. Ten years is 3650 days. */
export const DAYS_PER_YEAR = 365;

export const AGE_BANDS = ["22-34", "35-49", "50-64", "65+"] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export function ageBand(ageYears: number): AgeBand {
  if (ageYears < 35) return "22-34";
  if (ageYears < 50) return "35-49";
  if (ageYears < 65) return "50-64";
  return "65+";
}

/**
 * Nearest-rank percentile. `sortedAsc` must be ascending.
 * Rank is ceil(p * n), then converted to a 0-based index.
 */
export function percentileNearestRank(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const rank = Math.ceil(p * sortedAsc.length);
  const idx = Math.min(sortedAsc.length, Math.max(1, rank)) - 1;
  return sortedAsc[idx];
}

export interface GroupHarm {
  households: number;
  shortfallShare: number;
  avgShortfallDepth: number;
  /** Cumulative longest consecutive shortfall spell, in days, from day 0 through this year. */
  spellDaysP50: number;
  spellDaysP90: number;
  spellDaysMax: number;
  /** Households in the group with at least one short day in this year. */
  everShortShare: number;
  /** Households short on more than half of this year's days. */
  chronicShortShare: number;
  /** Sum of subsistence needs over sum of disposable income for the year's household-days. */
  needsToDisposable: number;
}

export interface QuintileHarm extends GroupHarm {
  quintile: number;
}

export interface AgeBandHarm extends GroupHarm {
  ageBand: AgeBand;
}

export interface YearlyHarmRow {
  year: number;
  dayStart: number;
  dayEnd: number;
  days: number;
  partial: boolean;
  abundance: number;
  publicShare: number;
  /** Year-end trailing work-optional share (existing 7-day window). */
  workOptionalShare: number;
  /** Year-end trailing disposable-income Gini (existing 30-day window). */
  giniDisposable: number;
  /** Household-days in the year with disposable income below needs, over household-days. */
  shortfallShare: number;
  /** Mean (needs - disposable) / needs on shortfall household-days. */
  avgShortfallDepth: number;
  spellDaysP50: number;
  spellDaysP90: number;
  spellDaysMax: number;
  /** Households with at least one short day in this year. */
  everShortShare: number;
  /** Households short on more than half of this year's days. */
  chronicShortShare: number;
  /** Sum of subsistence needs over sum of disposable income for the year's household-days. */
  needsToDisposable: number;
  /**
   * Quintile rank used for this year's shortfall.
   * Year 1 is worldgen ACS annual income, because no disposable history exists yet.
   * Later years are the previous year's total disposable income.
   */
  quintileBasis: "worldgenIncome" | "trailingDisposable";
  byQuintile: QuintileHarm[];
  byAgeBand: AgeBandHarm[];
}

export interface HarmObservation {
  dayIndex: number;
  abundance: number;
  publicShare: number;
  workOptionalShare: number;
  giniDisposable: number;
  householdDisposableCents: ReadonlyMap<number, number>;
  householdNeedsCents: ReadonlyMap<number, number>;
}

interface SpellState {
  current: number;
  longest: number;
}

interface FlowAccum {
  householdDays: number;
  shortfallDays: number;
  depthSum: number;
  needsSum: number;
  disposableSum: number;
}

interface HouseholdMeta {
  id: number;
  quintile: number;
  ageBand: AgeBand;
}

function freshAccum(): FlowAccum {
  return { householdDays: 0, shortfallDays: 0, depthSum: 0, needsSum: 0, disposableSum: 0 };
}

function shareOf(acc: FlowAccum): number {
  return acc.householdDays > 0 ? acc.shortfallDays / acc.householdDays : 0;
}

function depthOf(acc: FlowAccum): number {
  return acc.shortfallDays > 0 ? acc.depthSum / acc.shortfallDays : 0;
}

/** Mean subsistence needs over mean disposable income. Above 1, the group is short on average. */
function pressureOf(acc: FlowAccum): number {
  return acc.disposableSum > 0 ? acc.needsSum / acc.disposableSum : 0;
}

/**
 * Bounded per household: current spell, longest spell, and the open year's
 * shortfall totals. No per-day log.
 *
 * Quintiles are equal-count ranks, Q1 lowest.
 * Year 1 ranks households by worldgen ACS annual income (the income wages are
 * seeded from). Each later year re-ranks by total disposable income over the
 * year that just ended — trailing disposable at the start of the new year.
 * Ties break by household id. Age bands stay the mean member age at worldgen.
 */
export class TransitionHarmTracker {
  private readonly metas: HouseholdMeta[] = [];
  private readonly spells: SpellState[] = [];
  private quintileIds: number[][];
  private readonly ageIds: Record<AgeBand, number[]>;
  private readonly yearShortDays: number[];
  private readonly disposableYear: number[];
  private rows: YearlyHarmRow[] = [];
  private yearStartDay = 0;
  private yearDays = 0;
  private yearAll = freshAccum();
  private yearQuintile: FlowAccum[];
  private yearAge: Record<AgeBand, FlowAccum>;
  private quintileBasis: YearlyHarmRow["quintileBasis"] = "worldgenIncome";
  private pendingAbundance = 0;
  private pendingPublicShare = 0;
  private pendingWork = 0;
  private pendingGini = 0;

  constructor(world: M2aWorld) {
    const quintiles = assignHouseholdIncomeQuintiles(world.households);
    const n = world.households.length;
    this.quintileIds = [[], [], [], [], [], []];
    this.ageIds = { "22-34": [], "35-49": [], "50-64": [], "65+": [] };
    this.yearShortDays = Array.from({ length: n }, () => 0);
    this.disposableYear = Array.from({ length: n }, () => 0);
    this.yearQuintile = [freshAccum(), freshAccum(), freshAccum(), freshAccum(), freshAccum(), freshAccum()];
    this.yearAge = {
      "22-34": freshAccum(),
      "35-49": freshAccum(),
      "50-64": freshAccum(),
      "65+": freshAccum(),
    };
    for (const hh of world.households) {
      let ageSum = 0;
      for (const agentId of hh.agentIds) ageSum += world.agents[agentId].ageYears;
      const meanAge = hh.agentIds.length > 0 ? ageSum / hh.agentIds.length : 0;
      const band = ageBand(meanAge);
      const quintile = quintiles.get(hh.id) ?? 1;
      this.metas.push({ id: hh.id, quintile, ageBand: band });
      this.spells[hh.id] = { current: 0, longest: 0 };
      this.quintileIds[quintile].push(hh.id);
      this.ageIds[band].push(hh.id);
    }
  }

  observe(obs: HarmObservation): void {
    this.pendingAbundance = obs.abundance;
    this.pendingPublicShare = obs.publicShare;
    this.pendingWork = obs.workOptionalShare;
    this.pendingGini = obs.giniDisposable;

    for (const meta of this.metas) {
      const needs = obs.householdNeedsCents.get(meta.id) ?? 0;
      const disposable = obs.householdDisposableCents.get(meta.id) ?? 0;
      const spell = this.spells[meta.id];
      this.disposableYear[meta.id] = (this.disposableYear[meta.id] ?? 0) + disposable;
      this.yearAll.needsSum += needs;
      this.yearAll.disposableSum += disposable;
      this.yearQuintile[meta.quintile].needsSum += needs;
      this.yearQuintile[meta.quintile].disposableSum += disposable;
      this.yearAge[meta.ageBand].needsSum += needs;
      this.yearAge[meta.ageBand].disposableSum += disposable;
      const short = needs > 0 && disposable < needs;
      if (short) {
        spell.current += 1;
        if (spell.current > spell.longest) spell.longest = spell.current;
        this.yearShortDays[meta.id] = (this.yearShortDays[meta.id] ?? 0) + 1;
        const depth = (needs - disposable) / needs;
        this.yearAll.shortfallDays += 1;
        this.yearAll.depthSum += depth;
        this.yearQuintile[meta.quintile].shortfallDays += 1;
        this.yearQuintile[meta.quintile].depthSum += depth;
        this.yearAge[meta.ageBand].shortfallDays += 1;
        this.yearAge[meta.ageBand].depthSum += depth;
      } else if (spell) {
        spell.current = 0;
      }
      this.yearAll.householdDays += 1;
      this.yearQuintile[meta.quintile].householdDays += 1;
      this.yearAge[meta.ageBand].householdDays += 1;
    }

    this.yearDays += 1;
    if (this.yearDays === DAYS_PER_YEAR) this.emit(obs.dayIndex, false);
  }

  finish(lastDayIndex: number): YearlyHarmRow[] {
    if (this.yearDays > 0) this.emit(lastDayIndex, true);
    return this.rows;
  }

  private spellStats(ids: readonly number[]): { p50: number; p90: number; max: number } {
    const values = ids.map((id) => this.spells[id]?.longest ?? 0).sort((a, b) => a - b);
    return {
      p50: percentileNearestRank(values, 0.5),
      p90: percentileNearestRank(values, 0.9),
      max: values.length === 0 ? 0 : values[values.length - 1],
    };
  }

  private exposure(ids: readonly number[]): { everShortShare: number; chronicShortShare: number } {
    const n = ids.length;
    if (n === 0 || this.yearDays === 0) return { everShortShare: 0, chronicShortShare: 0 };
    let ever = 0;
    let chronic = 0;
    for (const id of ids) {
      const days = this.yearShortDays[id] ?? 0;
      if (days > 0) ever += 1;
      if (days * 2 > this.yearDays) chronic += 1;
    }
    return { everShortShare: ever / n, chronicShortShare: chronic / n };
  }

  private groupFrom(acc: FlowAccum, ids: readonly number[]): GroupHarm {
    const spells = this.spellStats(ids);
    return {
      households: ids.length,
      shortfallShare: shareOf(acc),
      avgShortfallDepth: depthOf(acc),
      spellDaysP50: spells.p50,
      spellDaysP90: spells.p90,
      spellDaysMax: spells.max,
      ...this.exposure(ids),
      needsToDisposable: pressureOf(acc),
    };
  }

  /** Equal-count ranks of this year's disposable, lowest first. Applied to the next year. */
  private rerankByTrailingDisposable(): void {
    const ranked = [...this.metas].sort((a, b) => {
      const diff = (this.disposableYear[a.id] ?? 0) - (this.disposableYear[b.id] ?? 0);
      return diff !== 0 ? diff : a.id - b.id;
    });
    this.quintileIds = [[], [], [], [], [], []];
    const n = ranked.length;
    for (let i = 0; i < n; i++) {
      const quintile = Math.min(5, Math.floor((i * 5) / n) + 1);
      ranked[i].quintile = quintile;
      this.quintileIds[quintile].push(ranked[i].id);
    }
  }

  private emit(dayIndex: number, partial: boolean): void {
    const allIds = this.metas.map((m) => m.id);
    const allSpells = this.spellStats(allIds);
    const byQuintile: QuintileHarm[] = [];
    for (let q = 1; q <= 5; q++) {
      byQuintile.push({
        quintile: q,
        ...this.groupFrom(this.yearQuintile[q], this.quintileIds[q]),
      });
    }
    const byAgeBand: AgeBandHarm[] = AGE_BANDS.map((band) => ({
      ageBand: band,
      ...this.groupFrom(this.yearAge[band], this.ageIds[band]),
    }));

    this.rows.push({
      year: this.rows.length + 1,
      dayStart: this.yearStartDay,
      dayEnd: dayIndex,
      days: this.yearDays,
      partial,
      abundance: this.pendingAbundance,
      publicShare: this.pendingPublicShare,
      workOptionalShare: this.pendingWork,
      giniDisposable: this.pendingGini,
      shortfallShare: shareOf(this.yearAll),
      avgShortfallDepth: depthOf(this.yearAll),
      spellDaysP50: allSpells.p50,
      spellDaysP90: allSpells.p90,
      spellDaysMax: allSpells.max,
      ...this.exposure(allIds),
      needsToDisposable: pressureOf(this.yearAll),
      quintileBasis: this.quintileBasis,
      byQuintile,
      byAgeBand,
    });

    this.rerankByTrailingDisposable();
    this.quintileBasis = "trailingDisposable";
    this.yearShortDays.fill(0);
    this.disposableYear.fill(0);
    this.yearStartDay = dayIndex + 1;
    this.yearDays = 0;
    this.yearAll = freshAccum();
    this.yearQuintile = [freshAccum(), freshAccum(), freshAccum(), freshAccum(), freshAccum(), freshAccum()];
    this.yearAge = {
      "22-34": freshAccum(),
      "35-49": freshAccum(),
      "50-64": freshAccum(),
      "65+": freshAccum(),
    };
  }
}
