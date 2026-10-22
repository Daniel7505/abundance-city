import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import type { DailySettlementResult, IndustryDayStats } from "../../economy/m2a/daily.js";
import { m2aMoneySupplyCents } from "../../economy/m2a/accounts.js";
import type { M2aWorld } from "./types.js";

export interface DailyMetricLine {
  day: number;
  tick: number;
  workOptionalShare: number;
  gini: number;
  medianAnnualizedHouseholdIncomeUsd: number;
  unmetNeed: number;
  shortHouseholds: number;
  byIndustry: IndustryDayStats[];
  costPerPerson: number;
  totalEnergyWh: number;
  humanEnergyWh: number;
  automatedEnergyWh: number;
  jobs: number;
  employed: number;
  displaced: number;
  priceIndex: number;
  moneySupply: number;
  wageSubsidyCents: number;
  payrollCents: number;
  totalLaborHours: number;
  ownershipDistributedCents: number;
  queued?: number;
  retired?: number;
  queueHiresCumulative?: number;
  medianReemploymentDelayDays?: number;
  queueHiresToday?: number;
  separationsToday?: number;
  laborPartition?: {
    employed: number;
    queued: number;
    retired: number;
    displacedUnqueued: number;
    nlf: number;
  };
}

interface TrailingHouseholdWindow {
  days: Array<{ nonWage: number; needs: number; inflow: number }>;
}

interface TrailingIncomeWindow {
  dailyInflowCents: number[];
}

export function giniCoefficient(values: number[]): number {
  const sorted = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    weighted += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return weighted / (n * sum);
}

export class M2aMetricsCollector {
  private householdWindows = new Map<number, TrailingHouseholdWindow>();
  private incomeWindows = new Map<number, TrailingIncomeWindow>();
  private readonly m2bEnabled: boolean;

  constructor(options: { m2bEnabled?: boolean } = {}) {
    this.m2bEnabled = options.m2bEnabled ?? false;
  }

  record(settlement: DailySettlementResult, world: M2aWorld): DailyMetricLine {
    const trailingOptional = m2aEconomy.trailingDaysForWorkOptional;
    const trailingGini = m2aEconomy.trailingDaysForGini;

    for (const hh of world.households) {
      let window = this.householdWindows.get(hh.id);
      if (!window) {
        window = { days: [] };
        this.householdWindows.set(hh.id, window);
      }
      const nonWage = settlement.householdNonWageIncomeCents.get(hh.id) ?? 0;
      const needs = settlement.householdNeedsCents.get(hh.id) ?? 0;
      const inflow = settlement.householdCashInflowCents.get(hh.id) ?? 0;
      window.days.push({ nonWage, needs, inflow });
      if (window.days.length > trailingOptional) window.days.shift();

      let incomeWindow = this.incomeWindows.get(hh.id);
      if (!incomeWindow) {
        incomeWindow = { dailyInflowCents: [] };
        this.incomeWindows.set(hh.id, incomeWindow);
      }
      incomeWindow.dailyInflowCents.push(inflow);
      if (incomeWindow.dailyInflowCents.length > trailingGini) {
        incomeWindow.dailyInflowCents.shift();
      }
    }

    let optionalHouseholds = 0;
    for (const hh of world.households) {
      const hasAutomationEmployment = hh.agentIds.some((id) => {
        const a = world.agents[id];
        return a.laborStatus === "employed" && !a.demandSlotEmployment;
      });
      const window = this.householdWindows.get(hh.id)!;
      const sumNonWage = window.days.reduce((s, d) => s + d.nonWage, 0);
      const sumNeeds = window.days.reduce((s, d) => s + d.needs, 0);
      if (hasAutomationEmployment) continue;
      const sumInflow = window.days.reduce((s, d) => s + d.inflow, 0);
      if (this.m2bEnabled) {
        if (sumInflow >= sumNeeds || sumNonWage >= sumNeeds) optionalHouseholds += 1;
      } else if (sumNonWage >= sumNeeds) {
        optionalHouseholds += 1;
      }
    }
    const workOptionalShare = optionalHouseholds / world.households.length;

    const annualizedHouseholdIncomeUsd: number[] = [];
    for (const hh of world.households) {
      const incomeWindow = this.incomeWindows.get(hh.id)!;
      const days = incomeWindow.dailyInflowCents.length;
      const sumCents = incomeWindow.dailyInflowCents.reduce((s, v) => s + v, 0);
      const meanDailyCents = days > 0 ? sumCents / days : 0;
      annualizedHouseholdIncomeUsd.push((meanDailyCents / 100) * 365);
    }
    const sortedAnnual = [...annualizedHouseholdIncomeUsd].sort((a, b) => a - b);
    const mid = Math.floor(sortedAnnual.length / 2);
    const medianAnnualizedHouseholdIncomeUsd =
      sortedAnnual.length === 0
        ? 0
        : sortedAnnual.length % 2 === 0
          ? (sortedAnnual[mid - 1] + sortedAnnual[mid]) / 2
          : sortedAnnual[mid];

    const jobs = settlement.byIndustry.reduce((s, row) => s + row.jobs, 0);
    const avgNeeds =
      world.households.reduce(
        (s, hh) => s + (settlement.householdNeedsCents.get(hh.id) ?? 0),
        0,
      ) / world.households.length;

    const line: DailyMetricLine = {
      day: settlement.day,
      tick: settlement.tick,
      workOptionalShare,
      gini: giniCoefficient(annualizedHouseholdIncomeUsd),
      medianAnnualizedHouseholdIncomeUsd,
      unmetNeed: settlement.unmetNeedCents,
      shortHouseholds: settlement.shortHouseholds,
      byIndustry: settlement.byIndustry,
      costPerPerson: Math.round(avgNeeds),
      totalEnergyWh: settlement.goodsUnitsPurchased,
      humanEnergyWh: settlement.goodsUnitsPurchased * (1 - settlement.employed / world.agents.length),
      automatedEnergyWh: settlement.goodsUnitsPurchased * (settlement.employed / world.agents.length),
      jobs,
      employed: settlement.employed,
      displaced: settlement.displaced,
      priceIndex: settlement.priceIndex,
      moneySupply: m2aMoneySupplyCents(world),
      wageSubsidyCents: settlement.wageSubsidyCents,
      payrollCents: settlement.payrollCents,
      totalLaborHours: settlement.totalLaborHours,
      ownershipDistributedCents: settlement.ownershipDistributedCents,
    };
    if (this.m2bEnabled) {
      line.queued = settlement.queued;
      line.retired = settlement.retired;
      line.queueHiresCumulative = settlement.queueHiresCumulative;
      line.medianReemploymentDelayDays = settlement.medianReemploymentDelayDays;
      line.queueHiresToday = settlement.queueHiresToday;
      line.separationsToday = settlement.separationsToday;
      line.laborPartition = settlement.laborPartition ?? undefined;
    }
    return line;
  }
}
