import coefficients from "../../../data/coefficients.json" with { type: "json" };
import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import type { M2aWorld } from "../../sim/m2a/types.js";

export function marginalPropensityToConsume(): number {
  const cfg = coefficients.discretionaryConsumption as {
    marginalPropensityToConsume: number;
  };
  return cfg.marginalPropensityToConsume;
}

/** Trailing mean daily household cash inflow (cents) for discretionary spending. */
export class HouseholdConsumptionState {
  private readonly trailingDays = m2aEconomy.trailingDaysForGini;
  private readonly windows = new Map<number, number[]>();

  constructor(world: M2aWorld) {
    for (const hh of world.households) {
      const acsDailyCents = Math.floor((hh.incomeAnnualUsd * 100) / 365);
      this.windows.set(hh.id, [acsDailyCents]);
    }
  }

  meanTrailingIncomeCents(householdId: number): number {
    const window = this.windows.get(householdId) ?? [0];
    const sum = window.reduce((s, v) => s + v, 0);
    return sum / window.length;
  }

  discretionaryBudgetCents(householdId: number, needsCents: number): number {
    const trailing = this.meanTrailingIncomeCents(householdId);
    const surplus = Math.max(0, trailing - needsCents);
    return Math.floor(marginalPropensityToConsume() * surplus);
  }

  recordDay(householdId: number, cashInflowCents: number): void {
    const window = this.windows.get(householdId);
    if (!window) return;
    window.push(cashInflowCents);
    if (window.length > this.trailingDays) window.shift();
  }
}
