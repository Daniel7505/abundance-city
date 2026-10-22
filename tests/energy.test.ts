import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/sim/engine.js";
import type { AgentTickLog } from "../src/sim/types.js";

function parseLogs(tickLogs: string[]): AgentTickLog[] {
  return tickLogs.map((line) => JSON.parse(line) as AgentTickLog);
}

describe("energy", () => {
  it("cumulative Wh is monotonic and non-negative per agent", () => {
    const { tickLogs } = runSimulation({ seed: 99, ticks: 300 });
    const entries = parseLogs(tickLogs);
    const byAgent = new Map<number, number[]>();

    for (const e of entries) {
      let series = byAgent.get(e.agentId);
      if (!series) {
        series = [];
        byAgent.set(e.agentId, series);
      }
      series.push(e.cumulativeWh);
    }

    for (const [, series] of byAgent) {
      for (const wh of series) {
        expect(wh).toBeGreaterThanOrEqual(0);
      }
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
      }
    }
  });
});
