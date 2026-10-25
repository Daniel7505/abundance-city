import coefficients from "../../../data/coefficients.json" with { type: "json" };
import type { SectorCostParameters } from "./pnl.js";

/**
 * Housing cost shares from the existing dwelling-rent coefficients.
 * Land does not automate. Maintenance labor is fully shed at abundance 1
 * under MarketWages. Maintenance materials fall by their sensitivity.
 * Supply of dwellings does not grow, and the cost decline is passed through.
 */
export function housingDwellingRentParameters(): SectorCostParameters {
  const cfg = coefficients.housingDwellingRent as {
    landRentShareOfMedianGrossRent: number;
    maintenanceLaborShareOfMaintenance: number;
    maintenanceMaterialsAutomationSensitivity: number;
  };
  const land = cfg.landRentShareOfMedianGrossRent;
  const maintenance = 1 - land;
  const laborShare0 = maintenance * cfg.maintenanceLaborShareOfMaintenance;
  const materials = maintenance * (1 - cfg.maintenanceLaborShareOfMaintenance);
  const nonlabor = land + materials;
  return {
    laborShare0,
    automatability: 1,
    nonlaborCostDeclineAtFullAutomation:
      nonlabor > 0 ? (materials * cfg.maintenanceMaterialsAutomationSensitivity) / nonlabor : 0,
    outputGrowthAtFullAutomation: 0,
    pricePassThrough: 1,
  };
}
