import type { DividendPolicy } from "./policy.js";
import type { Household } from "../../sim/m2a/types.js";
import type { Ledger } from "../ledger.js";
import { agentAccount } from "./accounts.js";

export function distributePoolByPolicy(
  ledger: Ledger,
  from: string,
  poolCents: number,
  policy: DividendPolicy,
  households: Household[],
  capitalShare: number[],
  agentCount: number,
  reason: string,
  agentInflows?: Map<number, number>,
): number {
  if (poolCents <= 0) return 0;
  const credit = (agentId: number, amt: number) => {
    if (amt <= 0) return;
    ledger.transfer(from, agentAccount(agentId), amt, reason);
    if (agentInflows) {
      agentInflows.set(agentId, (agentInflows.get(agentId) ?? 0) + amt);
    }
  };

  let moved = 0;
  if (policy.kind === "EqualDividend" || policy.kind === "TaxAndDividend") {
    const per = Math.floor(poolCents / agentCount);
    let rem = poolCents - per * agentCount;
    for (let i = 0; i < agentCount; i++) {
      const extra = rem > 0 ? 1 : 0;
      if (rem > 0) rem -= 1;
      const amt = per + extra;
      credit(i, amt);
      moved += amt;
    }
    return moved;
  }

  if (policy.kind === "CapitalShare") {
    let rem = poolCents;
    for (let h = 0; h < households.length; h++) {
      const hh = households[h];
      const share = Math.floor(poolCents * capitalShare[h]);
      if (share <= 0) continue;
      const per = Math.floor(share / hh.agentIds.length);
      let left = share - per * hh.agentIds.length;
      for (const agentId of hh.agentIds) {
        const amt = per + (left > 0 ? 1 : 0);
        if (left > 0) left -= 1;
        credit(agentId, amt);
        moved += amt;
        rem -= amt;
      }
    }
    if (rem > 0) {
      credit(0, rem);
      moved += rem;
    }
    return moved;
  }

  const w = policy.w;
  const equalPart = Math.floor(poolCents * w);
  const capPart = poolCents - equalPart;
  moved += distributePoolByPolicy(
    ledger,
    from,
    equalPart,
    { kind: "EqualDividend" },
    households,
    capitalShare,
    agentCount,
    `${reason}_eq`,
    agentInflows,
  );
  moved += distributePoolByPolicy(
    ledger,
    from,
    capPart,
    { kind: "CapitalShare" },
    households,
    capitalShare,
    agentCount,
    `${reason}_mix`,
    agentInflows,
  );
  return moved;
}
