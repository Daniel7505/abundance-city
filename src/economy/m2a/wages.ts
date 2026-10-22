import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { householdDailyNeedsCentsLegacy } from "../../sim/m2a/needs.js";
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

/**
 * Scale income-based wages so aggregate payroll matches the labor share of ACS needs
 * spending that households route to firms (housing + food + electricity).
 * Preserves relative wage dispersion (Gini) while closing the firm revenue / payroll gap.
 */
export function assignDailyWagesFromConsumption(world: M2aWorld): void {
  const laborShare = m2aEconomy.householdLaborIncomeShare;
  const incomeWages = new Map<number, number>();
  let incomePayroll = 0;
  let consumptionLaborPayroll = 0;

  for (const hh of world.households) {
    const needsTotal = householdDailyNeedsCentsLegacy(hh).requiredTotal;
    consumptionLaborPayroll += Math.floor(needsTotal * laborShare);
    for (const [id, wage] of incomeBasedDailyWageCents(hh, world.agents)) {
      incomeWages.set(id, wage);
      incomePayroll += wage;
    }
  }

  if (incomePayroll <= 0) return;

  const scale = consumptionLaborPayroll / incomePayroll;
  let scaledTotal = 0;
  for (const [id, wage] of incomeWages) {
    const scaled = Math.floor(wage * scale);
    world.agents[id].dailyWageCents = scaled;
    scaledTotal += scaled;
  }

  let remainder = consumptionLaborPayroll - scaledTotal;
  if (remainder <= 0) return;

  const order = [...incomeWages.entries()]
    .map(([id, wage]) => ({ id, frac: wage * scale - Math.floor(wage * scale) }))
    .sort((a, b) => b.frac - a.frac);
  for (let i = 0; remainder > 0 && i < order.length; i++) {
    world.agents[order[i].id].dailyWageCents += 1;
    remainder -= 1;
  }
}
