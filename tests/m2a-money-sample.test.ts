import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import {
  allM2aAccountIds,
  m2aMoneySupplyCents,
} from "../src/economy/m2a/accounts.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { industryAgentSlots } from "../src/town/lindsborg.js";

const ABUNDANCE_LEVELS = [0, 0.5, 1];
const POLICIES = ["EqualDividend", "CapitalShare", "TaxAndDividend", "Mix"];

describe("money conservation sample (M2a)", () => {
  for (const abundance of ABUNDANCE_LEVELS) {
    for (const policyName of POLICIES) {
      it(`conserves money (seed=42, a=${abundance}, policy=${policyName}, 30d)`, () => {
        const world = buildM2aWorld(42);
        const firmCount = industryAgentSlots().length;
        const result = runM2aSimulation({
          seed: 42,
          days: 30,
          abundance,
          policyName,
          mixWeight: 0.5,
        });
        const agentCount = result.summary.agentCount;
        expect(agentCount).toBe(379);
        const expected = m2aMoneySupplyCents(world);
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
