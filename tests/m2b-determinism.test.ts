import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";

/**
 * m2b-off, seed 42, a=0.5, 30 days, Mix, fixed human premium.
 * The legacy bill and 0.9 propensity are unchanged. The hashes moved because
 * MarketWages does not top a human firm up from the producer, and the daily
 * line records that wage-claim transfer (zero on this path). Summary includes
 * wagePolicy.
 */
const M2A_MIX_FULL_HASH_M2B_OFF =
  "ab4dc1f31696ece0227c81fcf50e6bd75a28deac41fc123dd447a44812d4134e";

/** Daily metric lines for that same m2b-off run. */
const M2A_MIX_DAILY_HASH =
  "8696d9a70b51688d86c73af483d5aa9d2f3c8008e0919680ca26cde2fd7beeab";

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
