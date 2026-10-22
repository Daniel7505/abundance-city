import { getTown, m2aConfig } from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";
import type { Household } from "./types.js";

export interface HouseholdDailyNeedsCents {
  housing: number;
  food: number;
  electricity: number;
  requiredTotal: number;
}

export function householdDailyNeedsCents(hh: Household): HouseholdDailyNeedsCents {
  const town = getTown();
  const cfg = m2aConfig();
  const medianIncome = readNumber(town.median_household_income_usd);
  const medianRentUsd = readNumber(town.median_gross_rent_usd_monthly);
  const medianHomeUsd = readNumber(town.median_home_value_usd);
  const incomeUsd = hh.incomeAnnualUsd;
  const incomeTier = incomeUsd / medianIncome;

  let housingMonthlyUsd: number;
  if (hh.isRenter) {
    housingMonthlyUsd = medianRentUsd * incomeTier;
  } else {
    housingMonthlyUsd =
      (medianHomeUsd * cfg.ownerHousingCostAnnualFractionOfValue) / 12;
  }
  const housing = Math.round((housingMonthlyUsd * 100) / 30);

  const food = Math.round((readNumber(town.ce_food_share) * incomeUsd * 100) / 365);

  const kwhPerDay = readNumber(town.electricity_kwh_per_month) / 30;
  const electricity = Math.round(kwhPerDay * readNumber(town.electricity_cents_per_kwh));

  const requiredTotal = housing + food + electricity;
  return { housing, food, electricity, requiredTotal };
}

export function agentShareOfNeed(total: number, householdSize: number): number {
  return Math.ceil(total / householdSize);
}
