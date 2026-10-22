import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { SeededPrng } from "../../sim/prng.js";
import type { Household } from "../../sim/m2a/types.js";

export function assignHouseholdCapitalShares(
  seed: number,
  households: Household[],
): number[] {
  const prng = new SeededPrng(seed + 9_001);
  const alpha = m2aEconomy.ownershipParetoAlpha;
  const draws = households.map(() => 1 / Math.pow(prng.next(), 1 / alpha));
  const byIncome = households
    .map((h, i) => ({ i, income: h.incomeAnnualUsd }))
    .sort((a, b) => a.income - b.income);
  const sortedDraws = [...draws].sort((a, b) => a - b);
  const shares = new Array(households.length).fill(0);
  for (let rank = 0; rank < byIncome.length; rank++) {
    shares[byIncome[rank].i] = sortedDraws[rank];
  }
  const sum = shares.reduce((s, v) => s + v, 0);
  return shares.map((v) => v / sum);
}
