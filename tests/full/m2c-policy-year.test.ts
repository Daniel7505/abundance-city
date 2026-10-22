import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../../src/sim/m2a/engine.js";

describe("M2c policy contrast", () => {
  it("policy contrast: EqualDividend workOptionalShare exceeds CapitalShare at a=1", () => {
    const run = (policyName: string) =>
      runM2aSimulation({
        seed: 42,
        days: 365,
        abundance: 1,
        policyName,
        m2bEnabled: true,
      }).distributionProbe!.workOptionalShareByWindow["7"];
    expect(run("EqualDividend")).toBeGreaterThan(run("CapitalShare"));
  });
});
