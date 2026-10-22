import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runSimulation } from "../src/sim/engine.js";

function logBlob(seed: number, ticks: number): string {
  const { tickLogs, summary } = runSimulation({ seed, ticks });
  return tickLogs.join("\n") + "\n" + JSON.stringify(summary);
}

describe("determinism", () => {
  it("same seed produces byte-identical combined log output", () => {
    const a = logBlob(42, 200);
    const b = logBlob(42, 200);
    expect(a).toBe(b);
    expect(createHash("sha256").update(a).digest("hex")).toBe(
      createHash("sha256").update(b).digest("hex"),
    );
  });

  it("different seeds produce different log output", () => {
    const a = logBlob(1, 150);
    const b = logBlob(2, 150);
    expect(a).not.toBe(b);
  });
});
