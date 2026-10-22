import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { humanLaborShare } from "./dial.js";
import type { AgentState, M2aWorld } from "../../sim/m2a/types.js";

export function industryUnitCostsCents(
  world: M2aWorld,
  abundance: number,
): { labor: number[]; energy: number[]; materials: number[]; capital: number[]; units: number[] } {
  const industryCount = world.industrySlotsBase.length;
  const labor = Array.from({ length: industryCount }, () => 0);
  const units = Array.from({ length: industryCount }, () => 0);
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      labor[a.industryIndex] += a.dailyWageCents;
      units[a.industryIndex] += 1;
    }
  }
  const humanShare = humanLaborShare(abundance);
  const energy = units.map(
    (u) =>
      Math.round(
        u *
          (humanShare * m2aEconomy.energyCentsPerWorkerDayAtHuman +
            (1 - humanShare) * m2aEconomy.energyCentsPerWorkerDayAtHuman * 0.25),
      ),
  );
  const materials = units.map((u) => u * m2aEconomy.materialsCentsPerWorkerDay);
  const capital = units.map((u) => u * m2aEconomy.capitalServiceCentsPerWorkerDay);
  return { labor, energy, materials, capital, units };
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

export function priceIndex(prices: number[]): number {
  const positive = prices.filter((p) => p > 0);
  if (positive.length === 0) return 0;
  return positive.reduce((s, p) => s + p, 0) / positive.length;
}
