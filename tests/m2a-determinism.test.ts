import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runM1Simulation } from "../src/sim/m1/engine.js";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import { runSimulation } from "../src/sim/engine.js";

const M1_DAILY_HASHES: Record<string, string> = {
  "0": "b14221eceff258b83450b06f7d5a57b2c40413264efd8f6938e7dcf103775305",
  "0.5": "fe8b681ceeff35612a5bda18bc79396e2e9c3a5962b54758c1edf0b771266b75",
  "1": "baecb2a0312adc718da2e094e9848faaee85dcec2dc3a658fae9cb5ec02192c2",
};

function m2aBlob(seed: number, abundance: number, days: number): string {
  const { dailyMetrics, summary } = runM2aSimulation({ seed, abundance, days });
  return dailyMetrics.join("\n") + "\n" + JSON.stringify(summary);
}

describe("M2a determinism", () => {
  it("seed-42 a=0.5 runs are byte-identical", () => {
    const a = m2aBlob(42, 0.5, 30);
    const b = m2aBlob(42, 0.5, 30);
    expect(a).toBe(b);
  });
});

describe("legacy modes", () => {
  it("M0 tick log hash unchanged", () => {
    const { tickLogs } = runSimulation({ seed: 42, ticks: 100 });
    const blob = tickLogs.join("\n") + (tickLogs.length ? "\n" : "");
    const hash = createHash("sha256").update(blob).digest("hex");
    expect(hash).toBe(
      "0c4137a6d23fec2d63f976e8d4d6085421043399d68288c4076956b3a602ea08",
    );
  });

  for (const [a, expected] of Object.entries(M1_DAILY_HASHES)) {
    it(`M1 daily hash preserved for a=${a}`, () => {
      const { dailyMetrics } = runM1Simulation({
        seed: 42,
        abundance: Number(a),
        days: 30,
      });
      const blob = dailyMetrics.join("\n") + (dailyMetrics.length ? "\n" : "");
      const hash = createHash("sha256").update(blob).digest("hex");
      expect(hash).toBe(expected);
    });
  }
});
