import { getTown } from "../../town/lindsborg.js";
import { agentAccount } from "./accounts.js";
import { taskAutomatabilityScore } from "./labor.js";
import type { Ledger } from "../ledger.js";
import type { AgentState } from "../../sim/m2a/types.js";

export interface WageWorker {
  id: number;
  industryIndex: number;
  targetCents: number;
}

/** Pay sticky wage rates; protect least-automatable tasks when the pool is insufficient. */
export function payWagePoolProRata(
  ledger: Ledger,
  fromAccount: string,
  workers: WageWorker[],
  poolCents: number,
  reason: string,
  wagePaidByAgent: Map<number, number>,
  agents?: AgentState[],
): number {
  const totalTarget = workers.reduce((s, w) => s + w.targetCents, 0);
  if (totalTarget <= 0 || poolCents <= 0) return 0;

  const budget = Math.min(poolCents, totalTarget);
  const town = getTown();
  const agentById = new Map(agents?.map((a) => [a.id, a]) ?? []);
  const ordered = [...workers].sort((a, b) => {
    const agentA = agentById.get(a.id);
    const agentB = agentById.get(b.id);
    const scoreA =
      agentA && a.industryIndex !== null
        ? taskAutomatabilityScore(agentA, a.industryIndex, town)
        : 0;
    const scoreB =
      agentB && b.industryIndex !== null
        ? taskAutomatabilityScore(agentB, b.industryIndex, town)
        : 0;
    return scoreA - scoreB || a.id - b.id;
  });

  let remaining = budget;
  let movedTotal = 0;
  for (const w of ordered) {
    const paid = Math.min(w.targetCents, remaining);
    if (paid <= 0) continue;
    const moved = ledger.transferUpTo(fromAccount, agentAccount(w.id), paid, reason);
    remaining -= moved;
    movedTotal += moved;
    wagePaidByAgent.set(w.id, (wagePaidByAgent.get(w.id) ?? 0) + moved);
  }
  return movedTotal;
}

export function laborHoursFromPaid(targetCents: number, paidCents: number): number {
  if (targetCents <= 0) return 0;
  return Math.min(1, paidCents / targetCents);
}
