import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import {
  allM2aAccountIds,
  m2aMoneySupplyCents,
} from "../src/economy/m2a/accounts.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { industryAgentSlots } from "../src/town/lindsborg.js";

describe("money conservation (M2b)", () => {
  it("conserves money with m2b enabled (seed=42, a=0.5, Mix, 60 days)", () => {
    const world = buildM2aWorld(42);
    const firmCount = industryAgentSlots().length;
    const result = runM2aSimulation({
      seed: 42,
      days: 60,
      abundance: 0.5,
      policyName: "Mix",
      m2bEnabled: true,
    });
    const agentCount = result.summary.agentCount;
    const expected = m2aMoneySupplyCents(world);
    expect(result.summary.moneySupplyCents).toBe(expected);
    let sum = 0;
    for (const id of allM2aAccountIds(agentCount, firmCount)) {
      expect(result.summary.accountBalancesCents[id]).toBeGreaterThanOrEqual(0);
      sum += result.summary.accountBalancesCents[id];
    }
    expect(sum).toBe(expected);
  });
});
