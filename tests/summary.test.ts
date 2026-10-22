import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/sim/engine.js";
import type { AgentTickLog } from "../src/sim/types.js";

describe("summary", () => {
  it("summary total matches sum of per-agent final cumulative Wh from logs", () => {
    const { tickLogs, summary } = runSimulation({ seed: 42, ticks: 250 });
    const lastByAgent = new Map<number, number>();

    for (const line of tickLogs) {
      const e = JSON.parse(line) as AgentTickLog;
      lastByAgent.set(e.agentId, e.cumulativeWh);
    }

    let sumFromLogs = 0;
    for (const wh of lastByAgent.values()) {
      sumFromLogs += wh;
    }

    expect(lastByAgent.size).toBe(100);
    expect(summary.totalEnergyWh).toBeCloseTo(sumFromLogs, 10);

    let sumFromSummary = 0;
    for (const wh of Object.values(summary.perAgentEnergyWh)) {
      sumFromSummary += wh;
    }
    expect(summary.totalEnergyWh).toBeCloseTo(sumFromSummary, 10);

    for (const [id, wh] of Object.entries(summary.perAgentEnergyWh)) {
      expect(wh).toBeCloseTo(lastByAgent.get(Number(id)) ?? -1, 10);
    }
  });
});
