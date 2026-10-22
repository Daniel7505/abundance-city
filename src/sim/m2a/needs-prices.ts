import { getTown } from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";
import type { M2aWorld } from "./types.js";
import { basketPriceIndex, industryPricesCents } from "../../economy/m2a/prices.js";

export interface NeedsPriceContext {
  goodsCentsPerUnit: number;
  housingCentsPerUnit: number;
  electricityCentsPerKwh: number;
}

export function needsPriceContext(world: M2aWorld, abundance: number): NeedsPriceContext {
  const town = getTown();
  const industryPrices = industryPricesCents(world, abundance);
  const goodsCentsPerUnit = Math.max(
    1,
    Math.round(basketPriceIndex(world, abundance, industryPrices)),
  );
  const ref = Math.max(1, world.referenceGoodsCentsPerUnit);
  const scale = goodsCentsPerUnit / ref;
  const medianRentDailyCents = Math.round(
    (readNumber(town.median_gross_rent_usd_monthly) * 100) / 30,
  );
  const utilityCentsPerKwh = readNumber(town.electricity_cents_per_kwh);
  return {
    goodsCentsPerUnit,
    housingCentsPerUnit: Math.max(1, Math.round(medianRentDailyCents * scale)),
    electricityCentsPerKwh: Math.max(1, Math.round(utilityCentsPerKwh * scale)),
  };
}
