import coefficients from "../../../data/coefficients.json" with { type: "json" };
import { getTown } from "../../town/lindsborg.js";
import { industryPricesCents } from "./prices.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

function tasteForIndustry(industryId: string): number {
  const map = coefficients.humanMadeVarietyTaste as Record<string, number | string>;
  const v = map[industryId];
  return typeof v === "number" ? v : 1;
}

/** Share of industry spending on human-made variant (vs automated); 1 at a=0. */
export function humanVariantExpenditureShare(
  world: M2aWorld,
  industryIndex: number,
  abundance: number,
): number {
  if (abundance <= 0) return 1;
  const town = getTown();
  const industryId = town.industry_employment_c24030[industryIndex]?.id ?? "other";
  const cfg = coefficients.humanMadeVariety as {
    substitutionElasticity: number;
  };
  const pAuto = Math.max(1, industryPricesCents(world, abundance)[industryIndex]);
  const pHuman = Math.max(1, industryPricesCents(world, 0)[industryIndex]);
  const taste = tasteForIndustry(industryId);
  const ratio = taste * (pAuto / pHuman);
  const sigma = cfg.substitutionElasticity;
  const x = Math.pow(ratio, sigma);
  return x / (1 + x);
}
