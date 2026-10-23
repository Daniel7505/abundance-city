import coefficients from "../../../data/coefficients.json" with { type: "json" };
import { getTown } from "../../town/lindsborg.js";
import { automatabilityForIndustry, requiredSlots } from "./labor.js";
import { industryPricesCents } from "./prices.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

export type HumanPremiumMode = "fixed" | "adaptive";

/**
 * Adaptive human premium carried across days.
 * `taste` starts at humanMadeVarietyTaste and decays only in adaptive mode.
 * `trailingRelativeCost` is the EMA of (pHuman - pAuto) / pHuman.
 */
export interface HumanPremiumState {
  trailingRelativeCost: number[];
  taste: number[];
}

const humanPremiumConfig = coefficients.humanPremium as {
  defaultMode?: string;
};

function coefficientMap(name: "humanMadeVarietyTaste" | "humanPremiumQualityProof" | "humanPremiumTrustInertiaDays") {
  return coefficients[name] as Record<string, number | string>;
}

function mappedNumber(
  name: "humanMadeVarietyTaste" | "humanPremiumQualityProof" | "humanPremiumTrustInertiaDays",
  industryId: string,
  fallback: number,
): number {
  const v = coefficientMap(name)[industryId];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

export function baseHumanTaste(industryId: string): number {
  return mappedNumber("humanMadeVarietyTaste", industryId, 1);
}

/** Quality proof in [0, 1]. Missing industries use the placeholder default 0.5. */
export function qualityProofForIndustry(industryId: string): number {
  const raw = mappedNumber("humanPremiumQualityProof", industryId, 0.5);
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

/** EMA memory in days. Missing industries use the placeholder default 90. */
export function trustInertiaDaysForIndustry(industryId: string): number {
  return Math.max(1, mappedNumber("humanPremiumTrustInertiaDays", industryId, 90));
}

export function defaultHumanPremiumMode(): HumanPremiumMode {
  return humanPremiumConfig.defaultMode === "fixed" ? "fixed" : "adaptive";
}

export function parseHumanPremiumMode(name: string | undefined): HumanPremiumMode {
  if (name === undefined || name === "") return defaultHumanPremiumMode();
  if (name === "fixed" || name === "adaptive") return name;
  throw new Error(`Unknown human premium mode: ${name}`);
}

export function createHumanPremiumState(industryCount: number): HumanPremiumState {
  const town = getTown();
  return {
    trailingRelativeCost: Array.from({ length: industryCount }, () => 0),
    taste: Array.from({ length: industryCount }, (_, ind) => {
      const industryId = town.industry_employment_c24030[ind]?.id ?? "other";
      return baseHumanTaste(industryId);
    }),
  };
}

/**
 * One day of evidence.
 * Trailing relative cost moves 1/inertia toward today's (pHuman - pAuto) / pHuman.
 * Taste then decays by trailingAdvantage * qualityProof / inertia.
 * Higher trust inertia (health vs education) slows both the signal and the decay.
 */
export function stepAdaptiveTaste(args: {
  taste: number;
  trailingRelativeCost: number;
  relativeCost: number;
  inertiaDays: number;
  qualityProof: number;
}): { taste: number; trailingRelativeCost: number } {
  const inertia = Math.max(1, args.inertiaDays);
  const proof = args.qualityProof < 0 ? 0 : args.qualityProof > 1 ? 1 : args.qualityProof;
  const trailing =
    args.trailingRelativeCost + (args.relativeCost - args.trailingRelativeCost) / inertia;
  const erosion = Math.min(1, (Math.max(0, trailing) * proof) / inertia);
  return {
    trailingRelativeCost: trailing,
    taste: args.taste * (1 - erosion),
  };
}

/** CES expenditure share on the human-made variant. */
export function cesHumanExpenditureShare(
  taste: number,
  pAuto: number,
  pHuman: number,
  substitutionElasticity: number,
): number {
  const ratio = taste * (Math.max(1, pAuto) / Math.max(1, pHuman));
  const x = Math.pow(ratio, substitutionElasticity);
  return x / (1 + x);
}

/**
 * Human-made expenditure share for every industry, computed once per day.
 * Abundance 0 is entirely human-made and does not update adaptive state.
 */
export function humanVariantSharesForDay(
  world: M2aWorld,
  abundance: number,
  state: HumanPremiumState,
  mode: HumanPremiumMode,
): number[] {
  const industryCount = world.industrySlotsBase.length;
  if (abundance <= 0) {
    return Array.from({ length: industryCount }, () => 1);
  }

  const sigma = (coefficients.humanMadeVariety as { substitutionElasticity: number })
    .substitutionElasticity;
  const town = getTown();
  const pAuto = industryPricesCents(world, abundance);
  const pHuman = industryPricesCents(world, 0);
  const shares = Array.from({ length: industryCount }, () => 0);

  if (state.trailingRelativeCost.length !== industryCount || state.taste.length !== industryCount) {
    const fresh = createHumanPremiumState(industryCount);
    state.trailingRelativeCost = fresh.trailingRelativeCost;
    state.taste = fresh.taste;
  }

  for (let ind = 0; ind < industryCount; ind++) {
    const industryId = town.industry_employment_c24030[ind]?.id ?? "other";
    const auto = Math.max(1, pAuto[ind] ?? 1);
    const human = Math.max(1, pHuman[ind] ?? 1);
    const relativeCost = (human - auto) / human;
    const base = baseHumanTaste(industryId);
    let taste = base;
    if (mode === "adaptive") {
      const stepped = stepAdaptiveTaste({
        taste: state.taste[ind] ?? base,
        trailingRelativeCost: state.trailingRelativeCost[ind] ?? 0,
        relativeCost,
        inertiaDays: trustInertiaDaysForIndustry(industryId),
        qualityProof: qualityProofForIndustry(industryId),
      });
      state.trailingRelativeCost[ind] = stepped.trailingRelativeCost;
      state.taste[ind] = stepped.taste;
      taste = stepped.taste;
    }
    shares[ind] = cesHumanExpenditureShare(taste, auto, human, sigma);
  }
  // Don't route more spend to the producer than the fraction of that
  // industry's jobs automation has actually removed. Otherwise a day with
  // a just above 0 buys the automated variant while every wage is still human,
  // and the human payroll goes unpaid. Taste can still keep a higher human share.
  for (let ind = 0; ind < industryCount; ind++) {
    const base = world.industrySlotsBase[ind] ?? 0;
    if (base <= 0) continue;
    const industryId = town.industry_employment_c24030[ind]?.id ?? "other";
    const cap = requiredSlots(base, abundance, automatabilityForIndustry(industryId));
    const stillHuman = cap / base;
    if (shares[ind] < stillHuman) shares[ind] = stillHuman;
  }
  return shares;
}
