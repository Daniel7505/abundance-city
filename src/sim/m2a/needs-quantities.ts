import coefficients from "../../../data/coefficients.json" with { type: "json" };
import type { Household, HouseholdNeedsQuantity } from "./types.js";
import { householdDailyNeedsCentsLegacy } from "./needs.js";
import type { NeedsPriceContext } from "./needs-prices.js";

export function deriveHouseholdNeedsQuantities(
  hh: Household,
  referencePrices: NeedsPriceContext,
): HouseholdNeedsQuantity {
  const legacy = householdDailyNeedsCentsLegacy(hh);
  const units =
    (coefficients.housingDwellingRent as { dwellingUnitsPerHouseholdDay: number })
      .dwellingUnitsPerHouseholdDay;
  return {
    housingServiceUnits: units,
    foodGoodsUnits: legacy.food / referencePrices.goodsCentsPerUnit,
    electricityKwh: legacy.electricity / referencePrices.electricityCentsPerKwh,
  };
}
