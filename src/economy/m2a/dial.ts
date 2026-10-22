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

/** Smoothstep on [0,1] — shared by layoffs and dividend pools to avoid dial cliffs. */
export function automationIntensity(a: number): number {
  clampAbundance(a);
  return a * a * (3 - 2 * a);
}

export function layoffIntensity(a: number): number {
  clampAbundance(a);
  return Math.pow(a, 2.2);
}

export function activeSlotsForIndustry(baseSlots: number, a: number): number {
  const removed = Math.round(layoffIntensity(a) * baseSlots);
  return Math.max(0, baseSlots - removed);
}

/** Smooth ramp for automation dividends (avoids cliff when treasury pool crosses needs). */
export function abundanceDividendStrength(a: number): number {
  return automationIntensity(a);
}
