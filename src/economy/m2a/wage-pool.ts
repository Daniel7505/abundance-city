import { agentAccount } from "./accounts.js";
import type { Ledger } from "../ledger.js";

export interface WageWorker {
  id: number;
  industryIndex: number;
  targetCents: number;
}

/** Pay fixed wage rates with pro-rata hours when the pool is insufficient. */
export function payWagePoolProRata(
  ledger: Ledger,
  fromAccount: string,
  workers: WageWorker[],
  poolCents: number,
  reason: string,
  wagePaidByAgent: Map<number, number>,
): number {
  const totalTarget = workers.reduce((s, w) => s + w.targetCents, 0);
  if (totalTarget <= 0 || poolCents <= 0) return 0;

  const budget = Math.min(poolCents, totalTarget);
  const ratio = budget / totalTarget;
  const pays = workers.map((w) => ({
    id: w.id,
    industryIndex: w.industryIndex,
    paid: Math.floor(w.targetCents * ratio),
  }));
  let paidSum = pays.reduce((s, p) => s + p.paid, 0);
  let remainder = budget - paidSum;
  const order = workers
    .map((w, i) => ({ i, frac: w.targetCents * ratio - pays[i].paid }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; remainder > 0 && k < order.length; k++) {
    pays[order[k].i].paid += 1;
    remainder -= 1;
    paidSum += 1;
  }

  let movedTotal = 0;
  for (const row of pays) {
    if (row.paid <= 0) continue;
    const moved = ledger.transferUpTo(fromAccount, agentAccount(row.id), row.paid, reason);
    movedTotal += moved;
    wagePaidByAgent.set(row.id, (wagePaidByAgent.get(row.id) ?? 0) + moved);
  }
  return movedTotal;
}

export function laborHoursFromPaid(targetCents: number, paidCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.min(1, paidCents / targetCents);
}
