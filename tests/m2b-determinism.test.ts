import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";

const M2A_MIX_HASH =
  "4eb8cde4f333e44799598669fd40a9ecc5724d5c141c73725c8f584a3ca2fed2";

function m2aBlob(m2bEnabled: boolean): string {
  const { dailyMetrics, summary } = runM2aSimulation({
    seed: 42,
    abundance: 0.5,
    days: 30,
    policyName: "Mix",
    mixWeight: 0.5,
    m2bEnabled,
  });
  return dailyMetrics.join("\n") + "\n" + JSON.stringify(summary);
}

describe("M2b flag off preserves M2a", () => {
  it("seed-42 a=0.5 Mix matches pinned M2a hash when m2bEnabled=false", () => {
    const blob = m2aBlob(false);
    const hash = createHash("sha256").update(blob).digest("hex");
    expect(hash).toBe(M2A_MIX_HASH);
  });

  it("m2b off runs are byte-identical", () => {
    expect(m2aBlob(false)).toBe(m2aBlob(false));
  });
});

describe("M2b determinism", () => {
  it("m2b on runs are byte-identical", () => {
    const a = m2aBlob(true);
    const b = m2aBlob(true);
    expect(a).toBe(b);
  });
});
