import coefficients from "../../../data/coefficients.json" with { type: "json" };
import type { Household, HouseholdNeedsQuantity } from "./types.js";
import { householdDailyNeedsCentsLegacy } from "./needs.js";
import type { NeedsPriceContext } from "./needs-prices.js";

/**
 * Convert legacy cent budgets into quantities at the wage-inclusive a=0
 * price context. `referencePrices` must be `needsPriceContext(world, 0)`
 * after wages are assigned and `referenceGoodsCentsPerUnit` is that same
 * basket, so the a=0 scale is 1.
 */
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
