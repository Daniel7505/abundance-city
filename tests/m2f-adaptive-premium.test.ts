import { beforeAll, describe, expect, it } from "vitest";
import { runM2aSimulation, type M2aSimResult } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import {
  qualityProofForIndustry,
  stepAdaptiveTaste,
  trustInertiaDaysForIndustry,
} from "../src/economy/m2a/human-variant.js";
import { getTown } from "../src/town/lindsborg.js";
import {
  allM2aAccountIds,
  m2aMoneySupplyCents,
} from "../src/economy/m2a/accounts.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { industryAgentSlots } from "../src/town/lindsborg.js";

const LAND_POLICIES = ["PrivateLandlords", "LandValueTax", "CommunityLandTrust"] as const;

function shareOf(line: DailyMetricLine, industryId: string): number {
  const labels = getTown().industry_employment_c24030.map((r) => r.id);
  const shares = line.humanVariantShareByIndustry ?? [];
  return shares[labels.indexOf(industryId)] ?? 0;
}

function linesOf(result: M2aSimResult): DailyMetricLine[] {
  return result.dailyMetrics.map((l) => JSON.parse(l) as DailyMetricLine);
}

describe("adaptive taste step", () => {
  it("health trust inertia is higher than education and health quality proof is lower", () => {
    expect(trustInertiaDaysForIndustry("health")).toBeGreaterThan(
      trustInertiaDaysForIndustry("educ"),
    );
    expect(qualityProofForIndustry("health")).toBeLessThan(qualityProofForIndustry("educ"));
  });

  it("the same cost evidence erodes education faster than health", () => {
    const relativeCost = 0.2;
    let educ = { taste: 2.4, trailingRelativeCost: 0 };
    let health = { taste: 2.2, trailingRelativeCost: 0 };
    for (let day = 0; day < 180; day++) {
      educ = stepAdaptiveTaste({
        ...educ,
        relativeCost,
        inertiaDays: trustInertiaDaysForIndustry("educ"),
        qualityProof: qualityProofForIndustry("educ"),
      });
      health = stepAdaptiveTaste({
        ...health,
        relativeCost,
        inertiaDays: trustInertiaDaysForIndustry("health"),
        qualityProof: qualityProofForIndustry("health"),
      });
    }
    const educKept = educ.taste / 2.4;
    const healthKept = health.taste / 2.2;
    expect(healthKept).toBeGreaterThan(educKept);
    expect(educ.taste).toBeLessThan(2.4);
    expect(health.taste).toBeLessThan(2.2);
  });
});

describe("adaptive human premium in the sim", () => {
  let fixedA0 = "";
  let adaptiveA0 = "";
  let fixedA1: M2aSimResult;
  let adaptiveA1: M2aSimResult;
  let adaptiveA1Again = "";

  beforeAll(() => {
    const base = {
      seed: 42,
      days: 365,
      policyName: "Mix",
      landPolicyName: "PrivateLandlords",
      m2bEnabled: true,
    } as const;
    const a0Fixed = runM2aSimulation({ ...base, abundance: 0, humanPremiumMode: "fixed" });
    const a0Adaptive = runM2aSimulation({ ...base, abundance: 0, humanPremiumMode: "adaptive" });
    fixedA0 = a0Fixed.dailyMetrics.join("\n");
    adaptiveA0 = a0Adaptive.dailyMetrics.join("\n");
    fixedA1 = runM2aSimulation({ ...base, abundance: 1, humanPremiumMode: "fixed" });
    adaptiveA1 = runM2aSimulation({ ...base, abundance: 1, humanPremiumMode: "adaptive" });
    adaptiveA1Again = runM2aSimulation({
      ...base,
      abundance: 1,
      humanPremiumMode: "adaptive",
    }).dailyMetrics.join("\n");
  });

  it("a=0 daily metrics match fixed mode", () => {
    expect(adaptiveA0).toBe(fixedA0);
  });

  it("a=1 adaptive run is deterministic", () => {
    expect(adaptiveA1.dailyMetrics.join("\n")).toBe(adaptiveA1Again);
  });

  it("a=1 adaptive human share in educ and health ends below fixed mode", () => {
    const fixedLast = linesOf(fixedA1).at(-1)!;
    const adaptiveLast = linesOf(adaptiveA1).at(-1)!;
    expect(shareOf(adaptiveLast, "educ")).toBeLessThan(shareOf(fixedLast, "educ"));
    expect(shareOf(adaptiveLast, "health")).toBeLessThan(shareOf(fixedLast, "health"));
  });

  it("a=1 adaptive health share stays above education at mid-run", () => {
    const mid = linesOf(adaptiveA1).find((line) => line.day === 182);
    expect(mid).toBeDefined();
    expect(shareOf(mid!, "health")).toBeGreaterThan(shareOf(mid!, "educ"));
  });

  it("a=1 adaptive Mix conserves money", () => {
    const world = buildM2aWorld(42);
    const expected = m2aMoneySupplyCents(world);
    expect(adaptiveA1.summary.moneySupplyCents).toBe(expected);
    expect(adaptiveA1.summary.agentCount).toBe(379);
    let sum = 0;
    for (const id of allM2aAccountIds(adaptiveA1.summary.agentCount, industryAgentSlots().length)) {
      const bal = adaptiveA1.summary.accountBalancesCents[id];
      expect(bal).toBeGreaterThanOrEqual(0);
      sum += bal;
    }
    expect(sum).toBe(expected);
  });
});

describe("land policy determinism", () => {
  for (const landPolicyName of LAND_POLICIES) {
    it(`a=0 30d Mix ${landPolicyName} is deterministic`, () => {
      const run = () =>
        runM2aSimulation({
          seed: 42,
          days: 30,
          abundance: 0,
          policyName: "Mix",
          landPolicyName,
          m2bEnabled: true,
        });
      const a = run();
      const b = run();
      expect(a.dailyMetrics.join("\n")).toBe(b.dailyMetrics.join("\n"));
      expect(a.summary.agentCount).toBe(379);
      expect(JSON.parse(a.dailyMetrics.at(-1)!).wageGapCents).toBe(0);
    });
  }
});

describe("default human premium mode", () => {
  it("omitting the mode matches adaptive", () => {
    const opts = {
      seed: 42,
      days: 20,
      abundance: 0.5,
      policyName: "Mix",
      m2bEnabled: true,
    };
    const implicit = runM2aSimulation(opts);
    const adaptive = runM2aSimulation({ ...opts, humanPremiumMode: "adaptive" as const });
    expect(implicit.dailyMetrics.join("\n")).toBe(adaptive.dailyMetrics.join("\n"));
    expect(implicit.summary.humanPremiumMode).toBe("adaptive");
  });
});
