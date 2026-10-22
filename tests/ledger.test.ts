import { describe, expect, it } from "vitest";
import { Ledger, LedgerError } from "../src/economy/ledger.js";
import {
  citizenAccount,
  TREASURY_ACCOUNT,
} from "../src/economy/accounts.js";

describe("ledger", () => {
  it("rejects negative transfer amounts", () => {
    const ledger = new Ledger();
    expect(() =>
      ledger.transfer(citizenAccount(0), TREASURY_ACCOUNT, -1, "bad"),
    ).toThrow(LedgerError);
  });

  it("rejects overdrafts", () => {
    const ledger = new Ledger();
    expect(() =>
      ledger.transfer(citizenAccount(0), TREASURY_ACCOUNT, 10_000_000, "bad"),
    ).toThrow(LedgerError);
  });

  it("rejects unknown accounts", () => {
    const ledger = new Ledger();
    expect(() =>
      ledger.transfer("unknown:1", TREASURY_ACCOUNT, 1, "bad"),
    ).toThrow(LedgerError);
  });
});
