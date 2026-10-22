import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import type { M2aWorld } from "../../sim/m2a/types.js";

/**
 * ACS non-labor share of the household income basket (for diagnostics / future transfers).
 */
export function acsNonLaborDailyCents(household: { incomeAnnualUsd: number }): number {
  const totalDaily = Math.floor((household.incomeAnnualUsd * 100) / 365);
  const laborShare = m2aEconomy.householdLaborIncomeShare;
  return totalDaily - Math.floor(totalDaily * laborShare);
}

function incomeBasedDailyWageCents(
  household: { incomeAnnualUsd: number; agentIds: number[] },
  agents: M2aWorld["agents"],
): Map<number, number> {
  const laborShare = m2aEconomy.householdLaborIncomeShare;
  const earners = household.agentIds.filter((id) => agents[id].laborStatus === "employed").length;
  const wage =
    earners > 0
      ? Math.floor(
          (household.incomeAnnualUsd * 100 * laborShare) / 365 / Math.max(1, earners),
        )
      : 0;
  const out = new Map<number, number>();
  for (const id of household.agentIds) {
    if (agents[id].laborStatus === "employed") out.set(id, wage);
  }
  return out;
}

/** Assign daily wages from ACS household income (labor share split across employed agents). */
export function assignDailyWagesFromConsumption(world: M2aWorld): void {
  for (const a of world.agents) {
    a.dailyWageCents = 0;
  }
  for (const hh of world.households) {
    for (const [id, wage] of incomeBasedDailyWageCents(hh, world.agents)) {
      world.agents[id].dailyWageCents = wage;
    }
  }
}
