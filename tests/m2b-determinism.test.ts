import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";

/**
 * Full blob (daily + summary) when m2b is off and human premium is fixed.
 * Summary includes humanPremiumMode, so this is not the pre-M2f metadata hash.
 * Daily lines under fixed mode stay the M2e hash below.
 */
const M2A_MIX_FULL_HASH_M2B_OFF =
  "bc11afa8cbcdfb4a971ec75c2a8dc247808deaaed017c85f5a07bab8cfb0bafe";

/** Daily metric lines with discretionary spend, ACS wages, and normalized price index. */
const M2A_MIX_DAILY_HASH =
  "906029bcb6d77dcffcb22b64065b357a7db6ffec775d51af5bbd0503b4acf4a4";

function m2aBlob(
  m2bEnabled: boolean,
  humanPremiumMode: "fixed" | "adaptive" = "adaptive",
): string {
  const { dailyMetrics, summary } = runM2aSimulation({
    seed: 42,
    abundance: 0.5,
    days: 30,
    policyName: "Mix",
    mixWeight: 0.5,
    m2bEnabled,
    humanPremiumMode,
  });
  return dailyMetrics.join("\n") + "\n" + JSON.stringify(summary);
}

function m2aDailyBlob(
  m2bEnabled: boolean,
  humanPremiumMode: "fixed" | "adaptive" = "adaptive",
): string {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    abundance: 0.5,
    days: 30,
    policyName: "Mix",
    mixWeight: 0.5,
    m2bEnabled,
    humanPremiumMode,
  });
  return dailyMetrics.join("\n");
}

describe("M2b flag off preserves M2a", () => {
  it("seed-42 a=0.5 Mix daily metrics match M2e fixed human premium when m2bEnabled=false", () => {
    const hash = createHash("sha256").update(m2aDailyBlob(false, "fixed")).digest("hex");
    expect(hash).toBe(M2A_MIX_DAILY_HASH);
  });

  it("seed-42 a=0.5 Mix full blob hash when m2bEnabled=false and human premium is fixed", () => {
    const hash = createHash("sha256").update(m2aBlob(false, "fixed")).digest("hex");
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
