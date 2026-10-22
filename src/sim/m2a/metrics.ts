import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import type { DailySettlementResult, IndustryDayStats } from "../../economy/m2a/daily.js";
import { m2aMoneySupplyCents } from "../../economy/m2a/accounts.js";
import type { M2aWorld } from "./types.js";

export interface DailyMetricLine {
  day: number;
  tick: number;
  workOptionalShare: number;
  gini: number;
  unmetNeed: number;
  shortHouseholds: number;
  byIndustry: IndustryDayStats[];
  costPerPerson: number;
  totalEnergyWh: number;
  humanEnergyWh: number;
  automatedEnergyWh: number;
  jobs: number;
  employed: number;
  price: number;
  moneySupply: number;
  wageSubsidyCents: number;
  payrollCents: number;
}

interface TrailingHouseholdWindow {
  days: Array<{ nonWage: number; needs: number }>;
}

interface TrailingAbundanceWindow {
  dailyAbundanceCents: number[];
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
  private abundanceWindows = new Map<number, TrailingAbundanceWindow>();

  record(
    settlement: DailySettlementResult,
    world: M2aWorld,
    wageIncomeByAgent: Map<number, number>,
  ): DailyMetricLine {
    const trailingDays = m2aEconomy.trailingDaysForWorkOptional;

    for (const hh of world.households) {
      let window = this.householdWindows.get(hh.id);
      if (!window) {
        window = { days: [] };
        this.householdWindows.set(hh.id, window);
      }
      const nonWage = settlement.householdNonWageIncomeCents.get(hh.id) ?? 0;
      const needs = settlement.householdNeedsCents.get(hh.id) ?? 0;
      window.days.push({ nonWage, needs });
      if (window.days.length > trailingDays) window.days.shift();

      let abundanceWindow = this.abundanceWindows.get(hh.id);
      if (!abundanceWindow) {
        abundanceWindow = { dailyAbundanceCents: [] };
        this.abundanceWindows.set(hh.id, abundanceWindow);
      }
      const dailyAbundance = settlement.householdAbundanceDividendCents.get(hh.id) ?? 0;
      abundanceWindow.dailyAbundanceCents.push(dailyAbundance);
      if (abundanceWindow.dailyAbundanceCents.length > trailingDays) {
        abundanceWindow.dailyAbundanceCents.shift();
      }
    }

    let optionalScore = 0;
    for (const hh of world.households) {
      const hasEmployed = hh.agentIds.some(
        (id) => world.agents[id].laborStatus === "employed",
      );
      if (hasEmployed) continue;
      const window = this.householdWindows.get(hh.id)!;
      const sumNonWage = window.days.reduce((s, d) => s + d.nonWage, 0);
      const sumNeeds = window.days.reduce((s, d) => s + d.needs, 0);
      const ratio = sumNeeds > 0 ? sumNonWage / sumNeeds : 0;
      const coverage = ratio / (ratio + 0.85);
      optionalScore += coverage;
    }
    const workOptionalShare = optionalScore / world.households.length;

    const annualizedHouseholdIncomeUsd: number[] = [];
    for (const hh of world.households) {
      const abundanceWindow = this.abundanceWindows.get(hh.id)!;
      const days = abundanceWindow.dailyAbundanceCents.length;
      const sumAbundanceCents = abundanceWindow.dailyAbundanceCents.reduce(
        (s, v) => s + v,
        0,
      );
      const meanAbundanceCents = days > 0 ? sumAbundanceCents / days : 0;
      const automationAnnualUsd = (meanAbundanceCents / 100) * 365;
      annualizedHouseholdIncomeUsd.push(hh.incomeAnnualUsd + automationAnnualUsd);
    }

    const jobs = settlement.byIndustry.reduce((s, row) => s + row.jobs, 0);

    return {
      day: settlement.day,
      tick: settlement.tick,
      workOptionalShare,
      gini: giniCoefficient(annualizedHouseholdIncomeUsd),
      unmetNeed: settlement.unmetNeedCents,
      shortHouseholds: settlement.shortHouseholds,
      byIndustry: settlement.byIndustry,
      costPerPerson: settlement.costPerPersonCents,
      totalEnergyWh: settlement.totalEnergyWh,
      humanEnergyWh: settlement.humanEnergyWh,
      automatedEnergyWh: settlement.automatedEnergyWh,
      jobs,
      employed: settlement.employed,
      price: settlement.priceCents,
      moneySupply: m2aMoneySupplyCents(world.agents.length, world.industrySlotsBase.length),
      wageSubsidyCents: settlement.wageSubsidyCents,
      payrollCents: settlement.payrollCents,
    };
  }
}
