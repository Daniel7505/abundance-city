import type { Household, M2aWorld } from "./types.js";
import { assignHouseholdIncomeQuintiles } from "./distribution.js";
import { dwellingRentCentsPerDay, targetHousingNeedsShareForQuintile } from "./housing-rent.js";
import { needsPriceContext } from "./needs-prices.js";
import coefficients from "../../../data/coefficients.json" with { type: "json" };

function nonHousingNeedsCents(hh: Household, prices: ReturnType<typeof needsPriceContext>): number {
  const food = Math.round(hh.needsQuantity.foodGoodsUnits * prices.goodsCentsPerUnit);
  const electricity = Math.round(
    hh.needsQuantity.electricityKwh * prices.electricityCentsPerKwh,
  );
  return food + electricity;
}

export function calibrateHouseholdHousingBurden(world: M2aWorld, prices: ReturnType<typeof needsPriceContext>): void {
  const quintileByHousehold = assignHouseholdIncomeQuintiles(world.households);
  const baseRent = dwellingRentCentsPerDay(0).totalCents;
  const units =
    (coefficients.housingDwellingRent as { dwellingUnitsPerHouseholdDay: number })
      .dwellingUnitsPerHouseholdDay;

  for (const hh of world.households) {
    hh.needsQuantity.housingServiceUnits = units;
    const quintile = quintileByHousehold.get(hh.id) ?? 1;
    const share = targetHousingNeedsShareForQuintile(quintile);
    const nonHousing = nonHousingNeedsCents(hh, prices);
    const targetHousing =
      share >= 1 ? baseRent * units : (share / (1 - share)) * nonHousing;
    hh.housingBurdenMultiplier =
      baseRent * units > 0 ? Math.max(0.25, targetHousing / (baseRent * units)) : 1;
  }
}

export function householdHousingNeedsCentsAt(hh: Household, abundance: number): number {
  const rent = dwellingRentCentsPerDay(abundance);
  const units = hh.needsQuantity.housingServiceUnits;
  return Math.round(rent.totalCents * units * hh.housingBurdenMultiplier);
}
