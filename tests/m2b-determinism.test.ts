import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";

/** Full blob (daily + summary) when m2b is off; summary includes m2bEnabled metadata. */
const M2A_MIX_FULL_HASH_M2B_OFF =
  "64eb9010785c7366243e7bfed5f3040055f625b5ee0886adccff1ec7bcf23296";

/** Daily metric lines with per-household EqualDividend and normalized price index. */
const M2A_MIX_DAILY_HASH =
  "8eaf9ad12a6310c99f168f8facc3f1223e3b7e2fc2d2b343d933dcfc58b99a93";

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

function m2aDailyBlob(m2bEnabled: boolean): string {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    abundance: 0.5,
    days: 30,
    policyName: "Mix",
    mixWeight: 0.5,
    m2bEnabled,
  });
  return dailyMetrics.join("\n");
}

describe("M2b flag off preserves M2a", () => {
  it("seed-42 a=0.5 Mix daily metrics match merged M2a when m2bEnabled=false", () => {
    const hash = createHash("sha256").update(m2aDailyBlob(false)).digest("hex");
    expect(hash).toBe(M2A_MIX_DAILY_HASH);
  });

  it("seed-42 a=0.5 Mix full blob hash when m2bEnabled=false (summary metadata)", () => {
    const hash = createHash("sha256").update(m2aBlob(false)).digest("hex");
    expect(hash).toBe(M2A_MIX_FULL_HASH_M2B_OFF);
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
