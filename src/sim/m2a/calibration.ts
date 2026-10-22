import { getTown, industryAgentSlots, scaledAgentCount } from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";
import { countEmployed } from "../../economy/m2a/labor.js";
import { giniCoefficient } from "./metrics.js";
import type { M2aWorld } from "./types.js";

export interface CalibrationSnapshot {
  agentCount: number;
  employed: number;
  industryCounts: number[];
  medianHouseholdIncomeUsd: number;
  giniHouseholdIncome: number;
  renterShare: number;
}

export function calibrationSnapshot(world: M2aWorld): CalibrationSnapshot {
  const incomes = world.households.map((h) => h.incomeAnnualUsd);
  const sorted = [...incomes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const renters = world.households.filter((h) => h.isRenter).length;
  return {
    agentCount: world.agents.length,
    employed: countEmployed(world.agents),
    industryCounts: world.industrySlotsBase.map((_, ind) =>
      world.agents.filter(
        (a) => a.laborStatus === "employed" && a.industryIndex === ind,
      ).length,
    ),
    medianHouseholdIncomeUsd: median,
    giniHouseholdIncome: giniCoefficient(incomes),
    renterShare: renters / world.households.length,
  };
}

export function expectedIndustrySlots(): number[] {
  return industryAgentSlots();
}

export function targetMedianIncomeUsd(): number {
  return readNumber(getTown().median_household_income_usd);
}

export function targetGini(): number {
  return readNumber(getTown().gini_index);
}

export function targetRenterShare(): number {
  const town = getTown();
  return readNumber(town.renter_occupied_households) / readNumber(town.households);
}

export function targetAgentCount(): number {
  return scaledAgentCount();
}
