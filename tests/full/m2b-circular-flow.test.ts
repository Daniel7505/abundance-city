import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../../src/sim/m2a/engine.js";
import { PRODUCER_WORKING_FLOAT_CENTS } from "../../src/economy/m2a/producer-settlement.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";

function lines(days: number, abundance: number): DailyMetricLine[] {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days,
    abundance,
    policyName: "Mix",
    m2bEnabled: true,
  });
  return dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
}

describe("M2b circular flow at abundance dial", () => {
  for (const abundance of [0, 0.5, 1] as const) {
    it(`a=${abundance} 365d: producer float, household cash, money conserved`, () => {
      const { dailyMetrics, summary } = runM2aSimulation({
        seed: 42,
        days: 365,
        abundance,
        policyName: "Mix",
        m2bEnabled: true,
      });
      const parsed = dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
      const last = parsed[parsed.length - 1];

      const producerBal = summary.accountBalancesCents.producer;
      const maxInflow = Math.max(...parsed.map((l) => l.producerInflowCents ?? 0));
      expect(producerBal).toBeGreaterThanOrEqual(PRODUCER_WORKING_FLOAT_CENTS - maxInflow);
      expect(producerBal).toBeLessThanOrEqual(PRODUCER_WORKING_FLOAT_CENTS + maxInflow);

      const cashSeries = parsed.map((l) => l.agentCashCentsTotal ?? 0);
      const first = cashSeries[0];
      const final = cashSeries.at(-1)!;
      const stableCash = cashSeries.slice(-30);
      const meanCash = stableCash.reduce((s, v) => s + v, 0) / stableCash.length;
      const maxDev = Math.max(...stableCash.map((v) => Math.abs(v - meanCash)));
      expect(maxDev / meanCash).toBeLessThanOrEqual(0.05);

      expect(summary.accountBalancesCents.treasury).toBeGreaterThanOrEqual(0);
      expect(last.wageGapCents).toBeDefined();
    });
  }
});
