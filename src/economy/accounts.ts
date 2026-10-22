import economy from "../../config/economy.json" with { type: "json" };

export type AccountKind =
  | "citizen"
  | "workplace"
  | "producer"
  | "landlord"
  | "treasury";

export type AccountId = string;

export function citizenAccount(id: number): AccountId {
  return `citizen:${id}`;
}

export function workplaceAccount(id: number): AccountId {
  return `workplace:${id}`;
}

export const PRODUCER_ACCOUNT = "producer";
export const LANDLORD_ACCOUNT = "landlord";
export const TREASURY_ACCOUNT = "treasury";

const KNOWN_PREFIXES = ["citizen:", "workplace:"];
const KNOWN_EXACT = new Set([
  PRODUCER_ACCOUNT,
  LANDLORD_ACCOUNT,
  TREASURY_ACCOUNT,
]);

export function isKnownAccount(id: AccountId): boolean {
  if (KNOWN_EXACT.has(id)) return true;
  return KNOWN_PREFIXES.some((p) => id.startsWith(p));
}

export function allAccountIds(): AccountId[] {
  const ids: AccountId[] = [];
  for (let i = 0; i < economy.citizenCount; i++) {
    ids.push(citizenAccount(i));
  }
  for (let i = 0; i < economy.workplaceCount; i++) {
    ids.push(workplaceAccount(i));
  }
  ids.push(PRODUCER_ACCOUNT, LANDLORD_ACCOUNT, TREASURY_ACCOUNT);
  return ids;
}

export function createInitialBalances(): Map<AccountId, number> {
  const balances = new Map<AccountId, number>();
  const init = economy.initialBalancesCents;
  for (let i = 0; i < economy.citizenCount; i++) {
    balances.set(citizenAccount(i), init.citizen);
  }
  for (let i = 0; i < economy.workplaceCount; i++) {
    balances.set(workplaceAccount(i), init.workplace);
  }
  balances.set(PRODUCER_ACCOUNT, init.producer);
  balances.set(LANDLORD_ACCOUNT, init.landlord);
  balances.set(TREASURY_ACCOUNT, init.treasury);
  return balances;
}

export function moneySupplyCents(): number {
  let total = 0;
  for (const v of createInitialBalances().values()) {
    total += v;
  }
  return total;
}
