import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import {
  allM2aAccountIds,
  m2aMoneySupplyCents,
} from "../src/economy/m2a/accounts.js";
import { industryAgentSlots } from "../src/town/lindsborg.js";

const SEEDS = [1, 2, 3, 4, 5];
const ABUNDANCE_LEVELS = [0, 0.5, 1];

describe("money conservation (M2a)", () => {
  for (const seed of SEEDS) {
    for (const abundance of ABUNDANCE_LEVELS) {
      it(`conserves money with no negative balances (seed=${seed}, a=${abundance})`, () => {
        const firmCount = industryAgentSlots().length;
        const result = runM2aSimulation({ seed, days: 60, abundance });
        const agentCount = result.summary.agentCount;
        const expected = m2aMoneySupplyCents(agentCount, firmCount);
        expect(result.summary.moneySupplyCents).toBe(expected);
        let sum = 0;
        for (const id of allM2aAccountIds(agentCount, firmCount)) {
          const bal = result.summary.accountBalancesCents[id];
          expect(bal).toBeGreaterThanOrEqual(0);
          sum += bal;
        }
        expect(sum).toBe(expected);
      });
    }
  }
});
