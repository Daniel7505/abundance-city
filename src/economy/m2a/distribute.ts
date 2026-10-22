import type { DividendPolicy } from "./policy.js";
import type { Household } from "../../sim/m2a/types.js";
import type { Ledger } from "../ledger.js";
import { agentAccount } from "./accounts.js";

function agentHouseholdId(households: Household[], agentCount: number): number[] {
  const map = new Array(agentCount).fill(0);
  for (const hh of households) {
    for (const agentId of hh.agentIds) {
      map[agentId] = hh.id;
    }
  }
  return map;
}

function allocateCapitalShareGross(
  poolCents: number,
  households: Household[],
  capitalShare: number[],
  agentCount: number,
): number[] {
  const grossByAgent = new Array(agentCount).fill(0);
  let allocated = 0;
  for (let h = 0; h < households.length; h++) {
    const hh = households[h];
    const share = Math.floor(poolCents * capitalShare[h]);
    if (share <= 0) continue;
    const per = Math.floor(share / hh.agentIds.length);
    let left = share - per * hh.agentIds.length;
    for (const agentId of hh.agentIds) {
      const amt = per + (left > 0 ? 1 : 0);
      if (left > 0) left -= 1;
      grossByAgent[agentId] += amt;
      allocated += amt;
    }
  }
  const remainder = poolCents - allocated;
  if (remainder > 0) {
    grossByAgent[0] += remainder;
  }
  return grossByAgent;
}

function progressiveTaxRate(capitalShare: number, maxCapitalShare: number): number {
  if (maxCapitalShare <= 0) return 0;
  const relative = capitalShare / maxCapitalShare;
  return Math.min(0.9, 0.05 + 0.85 * relative);
}

function distributeTaxAndDividend(
  ledger: Ledger,
  from: string,
  poolCents: number,
  households: Household[],
  capitalShare: number[],
  agentCount: number,
  reason: string,
  agentInflows?: Map<number, number>,
): number {
  const credit = (agentId: number, amt: number, tag: string) => {
    if (amt <= 0) return;
    ledger.transfer(from, agentAccount(agentId), amt, tag);
    if (agentInflows) {
      agentInflows.set(agentId, (agentInflows.get(agentId) ?? 0) + amt);
    }
  };

  const grossByAgent = allocateCapitalShareGross(
    poolCents,
    households,
    capitalShare,
    agentCount,
  );
  const hhByAgent = agentHouseholdId(households, agentCount);
  const maxShare = Math.max(...capitalShare, 0);

  let totalTax = 0;
  const netByAgent = new Array(agentCount).fill(0);
  for (let i = 0; i < agentCount; i++) {
    const gross = grossByAgent[i];
    if (gross <= 0) continue;
    const hhId = hhByAgent[i];
    const rate = progressiveTaxRate(capitalShare[hhId], maxShare);
    const tax = Math.floor(gross * rate);
    totalTax += tax;
    netByAgent[i] = gross - tax;
  }

  let moved = 0;
  for (let i = 0; i < agentCount; i++) {
    credit(i, netByAgent[i], `${reason}_net`);
    moved += netByAgent[i];
  }

  const perEqual = Math.floor(totalTax / agentCount);
  let equalRem = totalTax - perEqual * agentCount;
  for (let i = 0; i < agentCount; i++) {
    const extra = equalRem > 0 ? 1 : 0;
    if (equalRem > 0) equalRem -= 1;
    const amt = perEqual + extra;
    credit(i, amt, `${reason}_rebate`);
    moved += amt;
  }

  return moved;
}

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

  if (policy.kind === "TaxAndDividend") {
    return distributeTaxAndDividend(
      ledger,
      from,
      poolCents,
      households,
      capitalShare,
      agentCount,
      reason,
      agentInflows,
    );
  }

  let moved = 0;
  if (policy.kind === "EqualDividend") {
    const hhCount = households.length;
    const perHousehold = Math.floor(poolCents / hhCount);
    let rem = poolCents - perHousehold * hhCount;
    for (let h = 0; h < hhCount; h++) {
      const hh = households[h];
      const share = perHousehold + (rem > 0 ? 1 : 0);
      if (rem > 0) rem -= 1;
      if (share <= 0) continue;
      const perAgent = Math.floor(share / hh.agentIds.length);
      let left = share - perAgent * hh.agentIds.length;
      for (const agentId of hh.agentIds) {
        const amt = perAgent + (left > 0 ? 1 : 0);
        if (left > 0) left -= 1;
        credit(agentId, amt);
        moved += amt;
      }
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
