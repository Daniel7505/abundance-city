import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { getTown } from "../../town/lindsborg.js";
import { humanLaborShare, automatedLaborShare } from "./dial.js";
import { automatabilityForIndustry } from "./labor.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

function averageIndustryWageCents(world: M2aWorld, industryIndex: number): number {
  let sum = 0;
  let n = 0;
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex === industryIndex) {
      sum += a.dailyWageCents;
      n += 1;
    }
  }
  if (n > 0) return Math.round(sum / n);
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.dailyWageCents > 0) {
      sum += a.dailyWageCents;
      n += 1;
    }
  }
  return n > 0 ? Math.round(sum / n) : 0;
}

export function energyCentsPerUnitAtAbundance(abundance: number): number {
  const humanShare = humanLaborShare(abundance);
  const human = m2aEconomy.energyCentsPerWorkerDayAtHuman;
  const automated = human * 0.25;
  return Math.round(humanShare * human + (1 - humanShare) * automated);
}

export function industryUnitCostsCents(
  world: M2aWorld,
  abundance: number,
): { labor: number[]; energy: number[]; materials: number[]; capital: number[]; units: number[] } {
  const town = getTown();
  const industryCount = world.industrySlotsBase.length;
  const labor = Array.from({ length: industryCount }, () => 0);
  const energy = Array.from({ length: industryCount }, () => 0);
  const materials = Array.from({ length: industryCount }, () => 0);
  const capital = Array.from({ length: industryCount }, () => 0);
  const units = world.industrySlotsBase.map((base) => Math.max(0, base));
  const energyPerUnit = energyCentsPerUnitAtAbundance(abundance);

  for (let ind = 0; ind < industryCount; ind++) {
    const baseSlots = units[ind];
    if (baseSlots <= 0) continue;
    const industryId = town.industry_employment_c24030[ind].id;
    const intensity = automatabilityForIndustry(industryId);
    const laborCoef = 1 - abundance * intensity;
    const avgWage = averageIndustryWageCents(world, ind);
    labor[ind] = Math.round(avgWage * baseSlots * laborCoef);
    energy[ind] = energyPerUnit * baseSlots;
    materials[ind] = m2aEconomy.materialsCentsPerWorkerDay * baseSlots;
    capital[ind] = m2aEconomy.capitalServiceCentsPerWorkerDay * baseSlots;
  }

  return { labor, energy, materials, capital, units };
}

export function automatedProducerUnitCostCents(abundance: number): number {
  const energyPerUnit = energyCentsPerUnitAtAbundance(abundance);
  const autoLabor = Math.round(
    m2aEconomy.materialsCentsPerWorkerDay * 0.05 * (1 - humanLaborShare(abundance)),
  );
  return (
    autoLabor +
    energyPerUnit +
    m2aEconomy.materialsCentsPerWorkerDay +
    Math.round(m2aEconomy.capitalServiceCentsPerWorkerDay * 0.5)
  );
}

/** Energy, materials, and capital service per automated goods unit (excludes embedded auto-labor). */
export function automatedProducerNonLaborUnitCostCents(abundance: number): number {
  const energyPerUnit = energyCentsPerUnitAtAbundance(abundance);
  return (
    energyPerUnit +
    m2aEconomy.materialsCentsPerWorkerDay +
    Math.round(m2aEconomy.capitalServiceCentsPerWorkerDay * 0.5)
  );
}

export function industryPricesCents(world: M2aWorld, abundance: number): number[] {
  const { labor, energy, materials, capital, units } = industryUnitCostsCents(
    world,
    abundance,
  );
  const markup = m2aEconomy.firmMarkup;
  return units.map((u, ind) => {
    if (u <= 0) return 0;
    const unitCost = (labor[ind] + energy[ind] + materials[ind] + capital[ind]) / u;
    return Math.max(1, Math.round(unitCost / (1 - markup)));
  });
}

export function producerPriceCents(abundance: number): number {
  const markup = m2aEconomy.firmMarkup;
  const unitCost = automatedProducerUnitCostCents(abundance);
  return Math.max(1, Math.round(unitCost / (1 - markup)));
}

export function basketPriceIndex(
  world: M2aWorld,
  abundance: number,
  industryPrices: number[],
): number {
  const autoShare = automatedLaborShare(abundance);
  const weights = world.industrySlotsBase;
  const totalWeight = weights.reduce((s, w) => s + w, 0);
  if (totalWeight <= 0) return producerPriceCents(abundance);

  let humanIndex = 0;
  for (let ind = 0; ind < weights.length; ind++) {
    if (weights[ind] <= 0) continue;
    humanIndex += (weights[ind] / totalWeight) * industryPrices[ind];
  }

  const producer = producerPriceCents(abundance);
  return humanIndex * (1 - autoShare) + producer * autoShare;
}

export function priceIndex(prices: number[]): number {
  const positive = prices.filter((p) => p > 0);
  if (positive.length === 0) return 0;
  return positive.reduce((s, p) => s + p, 0) / positive.length;
}
