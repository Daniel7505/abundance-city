import coefficients from "../../../data/coefficients.json" with { type: "json" };
import { automatedLaborShare, humanLaborShare } from "../../economy/m2a/dial.js";
import { getTown } from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";

export interface DwellingRentCents {
  landRentCents: number;
  maintenanceCents: number;
  totalCents: number;
}

export function medianGrossRentDailyCents(): number {
  const town = getTown();
  return Math.round((readNumber(town.median_gross_rent_usd_monthly) * 100) / 30);
}

/** Rent for one dwelling-unit/day: fixed land rent + automatable maintenance (ACS B25064 baseline). */
export function dwellingRentCentsPerDay(abundance: number): DwellingRentCents {
  const cfg = coefficients.housingDwellingRent as {
    landRentShareOfMedianGrossRent: number;
    maintenanceLaborShareOfMaintenance: number;
    maintenanceMaterialsAutomationSensitivity: number;
  };
  const medianDaily = medianGrossRentDailyCents();
  const landRentCents = Math.round(medianDaily * cfg.landRentShareOfMedianGrossRent);
  const maintenanceBase = medianDaily - landRentCents;
  const laborPart = maintenanceBase * cfg.maintenanceLaborShareOfMaintenance;
  const materialsPart = maintenanceBase - laborPart;
  const auto = automatedLaborShare(abundance);
  const human = humanLaborShare(abundance);
  const maintenanceCents = Math.round(
    laborPart * human + materialsPart * (1 - auto * cfg.maintenanceMaterialsAutomationSensitivity),
  );
  return {
    landRentCents,
    maintenanceCents,
    totalCents: landRentCents + maintenanceCents,
  };
}

export function targetHousingNeedsShareForQuintile(quintile: number): number {
  const cfg = coefficients.housingNeedsShareByIncomeQuintile as {
    quintileShares: number[];
  };
  const idx = Math.max(0, Math.min(cfg.quintileShares.length - 1, quintile - 1));
  return cfg.quintileShares[idx];
}
