import { getTown, m2aConfig } from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";
import type { Household, HouseholdNeedsQuantity } from "./types.js";
import type { NeedsPriceContext } from "./needs-prices.js";

export interface HouseholdDailyNeedsCents {
  housing: number;
  food: number;
  electricity: number;
  requiredTotal: number;
}

/** ACS-derived fixed physical basket (set at worldgen, not recomputed from income daily). */
export function householdNeedsQuantities(hh: Household): HouseholdNeedsQuantity {
  return hh.needsQuantity;
}

/**
 * Legacy M2a: needs as fixed cent targets from income (housing/food) and fixed utility rate (electricity).
 * Electricity kWh is fixed but priced at a frozen cents/kWh — goods are not quantity-priced.
 */
export function householdDailyNeedsCentsLegacy(hh: Household): HouseholdDailyNeedsCents {
  const town = getTown();
  const cfg = m2aConfig();
  const medianIncome = readNumber(town.median_household_income_usd);
  const medianRentUsd = readNumber(town.median_gross_rent_usd_monthly);
  const medianHomeUsd = readNumber(town.median_home_value_usd);
  const incomeUsd = hh.incomeAnnualUsd;
  const incomeTier = incomeUsd / medianIncome;

  let housingMonthlyUsd: number;
  const ownerMonthlyUsd =
    (medianHomeUsd * cfg.ownerHousingCostAnnualFractionOfValue) / 12;
  if (hh.isRenter) {
    housingMonthlyUsd = medianRentUsd * incomeTier;
  } else {
    housingMonthlyUsd = ownerMonthlyUsd * incomeTier;
  }
  const housing = Math.round((housingMonthlyUsd * 100) / 30);

  const food = Math.round((readNumber(town.ce_food_share) * incomeUsd * 100) / 365);

  const kwhPerDay = readNumber(town.electricity_kwh_per_month) / 30;
  const electricity = Math.round(kwhPerDay * readNumber(town.electricity_cents_per_kwh));

  const requiredTotal = housing + food + electricity;
  return { housing, food, electricity, requiredTotal };
}

/** M2b: fixed quantities priced at current market indices (falls with automation). */
export function householdDailyNeedsCentsFromQuantities(
  hh: Household,
  prices: NeedsPriceContext,
): HouseholdDailyNeedsCents {
  const q = householdNeedsQuantities(hh);
  const housing = Math.round(q.housingServiceUnits * prices.housingCentsPerUnit);
  const food = Math.round(q.foodGoodsUnits * prices.goodsCentsPerUnit);
  const electricity = Math.round(q.electricityKwh * prices.electricityCentsPerKwh);
  const requiredTotal = housing + food + electricity;
  return { housing, food, electricity, requiredTotal };
}

/** @deprecated Use legacy or quantity path explicitly. */
export function householdDailyNeedsCents(hh: Household): HouseholdDailyNeedsCents {
  return householdDailyNeedsCentsLegacy(hh);
}

export function agentShareOfNeed(total: number, householdSize: number): number {
  return Math.ceil(total / householdSize);
}
