import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runM1Simulation } from "../src/sim/m1/engine.js";
import { runSimulation } from "../src/sim/engine.js";

function m1Blob(seed: number, abundance: number, days: number): string {
  const { tickLogs, dailyMetrics, summary } = runM1Simulation({
    seed,
    abundance,
    days,
  });
  return (
    tickLogs.join("\n") +
    "\n" +
    dailyMetrics.join("\n") +
    "\n" +
    JSON.stringify(summary)
  );
}

describe("M1 determinism", () => {
  it("seed-42 a=0.5 30-day runs are byte-identical", () => {
    const a = m1Blob(42, 0.5, 30);
    const b = m1Blob(42, 0.5, 30);
    expect(a).toBe(b);
  });
});

describe("M0 legacy mode", () => {
  it("still yields the M0 sha256 for seed-42 ticks-100", () => {
    const { tickLogs } = runSimulation({ seed: 42, ticks: 100 });
    const blob = tickLogs.join("\n") + (tickLogs.length ? "\n" : "");
    const hash = createHash("sha256").update(blob).digest("hex");
    expect(hash).toBe(
      "0c4137a6d23fec2d63f976e8d4d6085421043399d68288c4076956b3a602ea08",
    );
  });
});
