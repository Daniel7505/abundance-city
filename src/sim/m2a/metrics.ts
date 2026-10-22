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
}

interface TrailingHouseholdWindow {
  days: Array<{ nonWage: number; needs: number }>;
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

  record(
    settlement: DailySettlementResult,
    world: M2aWorld,
    wageIncomeByAgent: Map<number, number>,
  ): DailyMetricLine {
    for (const hh of world.households) {
      let window = this.householdWindows.get(hh.id);
      if (!window) {
        window = { days: [] };
        this.householdWindows.set(hh.id, window);
      }
      const nonWage = settlement.householdNonWageIncomeCents.get(hh.id) ?? 0;
      const needs = settlement.householdNeedsCents.get(hh.id) ?? 0;
      window.days.push({ nonWage, needs });
      const maxLen = m2aEconomy.trailingDaysForWorkOptional;
      if (window.days.length > maxLen) window.days.shift();
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
      const coverage = sumNeeds > 0 ? Math.min(1, sumNonWage / sumNeeds) : 1;
      optionalScore += coverage;
    }
    const workOptionalShare = optionalScore / world.households.length;

    const incomes: number[] = [];
    for (const a of world.agents) {
      const wage = settlement.wagePaidByAgent.get(a.id) ?? wageIncomeByAgent.get(a.id) ?? 0;
      const nonWage = settlement.agentIncomeCents.get(a.id) ?? 0;
      incomes.push(wage + nonWage);
    }

    const jobs = settlement.byIndustry.reduce((s, row) => s + row.jobs, 0);

    return {
      day: settlement.day,
      tick: settlement.tick,
      workOptionalShare,
      gini: giniCoefficient(incomes),
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
    };
  }
}
