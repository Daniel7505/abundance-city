import {
  type AccountId,
  createInitialBalances,
  isKnownAccount,
  moneySupplyCents,
} from "./accounts.js";

export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export interface TransferRecord {
  from: AccountId;
  to: AccountId;
  cents: number;
  reason: string;
}

export interface LedgerOptions {
  initialSupplyCents?: number;
  knownAccounts?: ReadonlySet<AccountId>;
}

function sumBalances(map: Map<AccountId, number>): number {
  let sum = 0;
  for (const v of map.values()) sum += v;
  return sum;
}

export class Ledger {
  private balances: Map<AccountId, number>;
  readonly initialSupplyCents: number;
  private transfers: TransferRecord[] = [];
  private readonly knownAccounts: ReadonlySet<AccountId> | null;

  constructor(initial?: Map<AccountId, number>, options?: LedgerOptions) {
    this.balances = initial ?? createInitialBalances();
    this.knownAccounts = options?.knownAccounts ?? null;
    this.initialSupplyCents =
      options?.initialSupplyCents ?? sumBalances(this.balances);
  }

  private isKnown(account: AccountId): boolean {
    if (this.knownAccounts) return this.knownAccounts.has(account);
    return isKnownAccount(account);
  }

  getBalance(account: AccountId): number {
    if (!this.isKnown(account)) {
      throw new LedgerError(`Unknown account: ${account}`);
    }
    return this.balances.get(account) ?? 0;
  }

  transfer(from: AccountId, to: AccountId, cents: number, reason: string): void {
    if (!Number.isInteger(cents)) {
      throw new LedgerError("Transfer amount must be integer cents");
    }
    if (cents < 0) {
      throw new LedgerError("Transfer amount cannot be negative");
    }
    if (cents === 0) return;
    if (!this.isKnown(from) || !this.isKnown(to)) {
      throw new LedgerError("Unknown account in transfer");
    }
    const fromBal = this.getBalance(from);
    if (fromBal < cents) {
      throw new LedgerError(`Overdraft: ${from} has ${fromBal}, need ${cents}`);
    }
    this.balances.set(from, fromBal - cents);
    this.balances.set(to, (this.balances.get(to) ?? 0) + cents);
    this.transfers.push({ from, to, cents, reason });
  }

  /** Transfer up to `maxCents` without overdraft; returns amount moved. */
  transferUpTo(
    from: AccountId,
    to: AccountId,
    maxCents: number,
    reason: string,
  ): number {
    if (maxCents < 0) throw new LedgerError("Transfer amount cannot be negative");
    const amount = Math.min(maxCents, this.getBalance(from));
    if (amount > 0) this.transfer(from, to, amount, reason);
    return amount;
  }

  totalSupplyCents(): number {
    let sum = 0;
    for (const v of this.balances.values()) {
      sum += v;
    }
    return sum;
  }

  getTransfers(): readonly TransferRecord[] {
    return this.transfers;
  }

  snapshotBalances(): Map<AccountId, number> {
    return new Map(this.balances);
  }
}
