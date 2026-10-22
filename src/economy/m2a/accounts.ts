import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import type { M2aWorld } from "../../sim/m2a/types.js";
import { householdDailyNeedsCents } from "../../sim/m2a/needs.js";

export type AccountId = string;

export const PRODUCER_ACCOUNT = "producer";
export const LANDLORD_ACCOUNT = "landlord";
export const TREASURY_ACCOUNT = "treasury";

export function agentAccount(id: number): AccountId {
  return `agent:${id}`;
}

export function firmAccount(industryIndex: number): AccountId {
  return `firm:${industryIndex}`;
}

export function isKnownM2aAccount(id: AccountId, agentCount: number, firmCount: number): boolean {
  if (id === PRODUCER_ACCOUNT || id === LANDLORD_ACCOUNT || id === TREASURY_ACCOUNT) {
    return true;
  }
  if (id.startsWith("agent:")) {
    const n = Number(id.slice(6));
    return Number.isInteger(n) && n >= 0 && n < agentCount;
  }
  if (id.startsWith("firm:")) {
    const n = Number(id.slice(5));
    return Number.isInteger(n) && n >= 0 && n < firmCount;
  }
  return false;
}

export function allM2aAccountIds(agentCount: number, firmCount: number): AccountId[] {
  const ids: AccountId[] = [];
  for (let i = 0; i < agentCount; i++) ids.push(agentAccount(i));
  for (let i = 0; i < firmCount; i++) ids.push(firmAccount(i));
  ids.push(PRODUCER_ACCOUNT, LANDLORD_ACCOUNT, TREASURY_ACCOUNT);
  return ids;
}

export function createM2aInitialBalances(world: M2aWorld): Map<AccountId, number> {
  const balances = new Map<AccountId, number>();
  const agentCount = world.agents.length;
  const firmCount = world.industrySlotsBase.length;

  let dailyPayroll = 0;
  const payrollByFirm = Array.from({ length: firmCount }, () => 0);
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      dailyPayroll += a.dailyWageCents;
      payrollByFirm[a.industryIndex] += a.dailyWageCents;
    }
  }

  const nlf = world.agents.filter((a) => a.laborStatus === "not_in_labor_force").length;
  const dailySs = nlf * m2aEconomy.socialSecurityDailyCentsPerNlfAgent;

  let dailyNeeds = 0;
  for (const hh of world.households) {
    dailyNeeds += householdDailyNeedsCents(hh).requiredTotal;
  }

  for (const hh of world.households) {
    const perAgent = Math.ceil(
      (householdDailyNeedsCents(hh).requiredTotal * 30) / hh.size,
    );
    for (const id of hh.agentIds) {
      balances.set(agentAccount(id), perAgent);
    }
  }

  for (let ind = 0; ind < firmCount; ind++) {
    balances.set(firmAccount(ind), payrollByFirm[ind] * 45 + 50_000);
  }

  balances.set(PRODUCER_ACCOUNT, 100_000);
  balances.set(LANDLORD_ACCOUNT, Math.floor(dailyNeeds * 0.35 * 30));
  balances.set(
    TREASURY_ACCOUNT,
    Math.floor(dailySs * 60 + dailyPayroll * m2aEconomy.payrollTaxRate * 30),
  );

  return balances;
}

export function m2aMoneySupplyCents(world: M2aWorld): number {
  let total = 0;
  for (const v of createM2aInitialBalances(world).values()) {
    total += v;
  }
  return total;
}
