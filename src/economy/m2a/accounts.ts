import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };

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

export function createM2aInitialBalances(
  agentCount: number,
  firmCount: number,
): Map<AccountId, number> {
  const init = m2aEconomy.initialBalancesCents;
  const balances = new Map<AccountId, number>();
  for (let i = 0; i < agentCount; i++) {
    balances.set(agentAccount(i), init.agent);
  }
  for (let i = 0; i < firmCount; i++) {
    balances.set(firmAccount(i), init.firm);
  }
  balances.set(PRODUCER_ACCOUNT, init.producer);
  balances.set(LANDLORD_ACCOUNT, init.landlord);
  balances.set(TREASURY_ACCOUNT, init.treasury);
  return balances;
}

export function m2aMoneySupplyCents(agentCount: number, firmCount: number): number {
  let total = 0;
  for (const v of createM2aInitialBalances(agentCount, firmCount).values()) {
    total += v;
  }
  return total;
}
