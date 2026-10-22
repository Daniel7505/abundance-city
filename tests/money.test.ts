import { describe, expect, it } from "vitest";
import { runM1Simulation } from "../src/sim/m1/engine.js";
import { allAccountIds } from "../src/economy/accounts.js";
import { Ledger } from "../src/economy/ledger.js";

const SEEDS = [1, 2, 3, 4, 5];
const ABUNDANCE_LEVELS = [0, 0.5, 1];

describe("money conservation (M1)", () => {
  for (const seed of SEEDS) {
    for (const abundance of ABUNDANCE_LEVELS) {
      it(`conserves money with no negative balances (seed=${seed}, a=${abundance})`, () => {
        const expectedSupply = new Ledger().initialSupplyCents;
        const result = runM1Simulation({ seed, days: 30, abundance });
        expect(result.summary.moneySupplyCents).toBe(expectedSupply);
        let sum = 0;
        for (const id of allAccountIds()) {
          const bal = result.summary.accountBalancesCents[id];
          expect(bal).toBeGreaterThanOrEqual(0);
          sum += bal;
        }
        expect(sum).toBe(expectedSupply);
      });
    }
  }
});
