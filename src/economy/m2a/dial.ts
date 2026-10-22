import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };

export function clampAbundance(a: number): number {
  if (a < 0 || a > 1) throw new Error(`Abundance must be in [0,1], got ${a}`);
  return a;
}

export function goodsPriceCents(a: number): number {
  clampAbundance(a);
  const raw =
    m2aEconomy.priceP0Cents * (1 - m2aEconomy.abundancePriceFactor * a);
  return Math.max(0, Math.round(raw));
}

export function outputShares(a: number): { human: number; automated: number } {
  clampAbundance(a);
  return { human: 1 - a, automated: a };
}

export function activeSlotsForIndustry(baseSlots: number, a: number): number {
  const removed = Math.round(a * baseSlots);
  return Math.max(0, baseSlots - removed);
}
