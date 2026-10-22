import economy from "../../config/economy.json" with { type: "json" };

export function clampAbundance(a: number): number {
  if (a < 0 || a > 1) {
    throw new Error(`Abundance must be in [0,1], got ${a}`);
  }
  return a;
}

export function jobSlotsForAbundance(a: number): number {
  clampAbundance(a);
  return Math.round((1 - a) * economy.baseJobSlotsTotal);
}

/** Slots per workplace after removing capacity in workplace id order. */
export function workplaceSlotCaps(a: number): number[] {
  const total = jobSlotsForAbundance(a);
  const caps = Array.from(
    { length: economy.workplaceCount },
    () => economy.baseSlotsPerWorkplace,
  );
  let toRemove = economy.baseJobSlotsTotal - total;
  let wp = 0;
  while (toRemove > 0 && wp < economy.workplaceCount) {
    if (caps[wp] > 0) {
      caps[wp] -= 1;
      toRemove -= 1;
    } else {
      wp += 1;
    }
  }
  return caps;
}

export function goodsPriceCents(a: number): number {
  clampAbundance(a);
  const raw = economy.priceP0Cents * (1 - economy.abundancePriceFactor * a);
  return Math.max(0, Math.round(raw));
}

export function outputShares(a: number): { human: number; automated: number } {
  clampAbundance(a);
  return { human: 1 - a, automated: a };
}
