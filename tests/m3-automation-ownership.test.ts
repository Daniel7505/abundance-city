import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  automationLevelAtDay,
  parseAutomationPathMode,
  resolveAutomationPath,
} from "../src/economy/m2a/automation-path.js";
import {
  allM2aAccountIds,
  PUBLIC_FUND_ACCOUNT,
} from "../src/economy/m2a/accounts.js";
import { runM2aSimulation, type M2aSimResult } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import { assignHouseholdIncomeQuintiles } from "../src/sim/m2a/distribution.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { getTown, industryAgentSlots } from "../src/town/lindsborg.js";
import {
  percentileNearestRank,
  TransitionHarmTracker,
} from "../src/sim/m2a/transition-harm.js";

/**
 * M2f fixed-a output, seed 42, 30 days, Mix, PrivateLandlords, m2b on, adaptive premium.
 * Daily lines and the summary object. A fixed path must reproduce both.
 */
const M2F_DAILY_A0 =
  "a7ec45f93fcca49120f87f356e5eed73c6615c58dd7eeddd71b42fd483de4c9f";
const M2F_SUMMARY_A0 =
  "e02cec4b8790e43a01b8eaac7fb7f1094fb4775ab48efbe543cd67ed24c25ca4";
const M2F_DAILY_A05 =
  "26d3800888c0eb22a96783a05e1d8de8a259fb817421a151dd5b085a1d2e86ee";
const M2F_SUMMARY_A05 =
  "ffb2ef99fc97c6156d1c7e6a7bab0fec48601c76512e07aa2c6e4c025c7493a4";

function sha(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function fixedRun(abundance: number, automationPath?: "fixed"): M2aSimResult {
  return runM2aSimulation({
    seed: 42,
    days: 30,
    abundance,
    policyName: "Mix",
    landPolicyName: "PrivateLandlords",
    m2bEnabled: true,
    humanPremiumMode: "adaptive",
    ...(automationPath ? { automationPath } : {}),
  });
}

function linesOf(result: M2aSimResult): DailyMetricLine[] {
  return result.dailyMetrics.map((line) => JSON.parse(line) as DailyMetricLine);
}

function industryShare(line: DailyMetricLine, industryId: string): number {
  const labels = getTown().industry_employment_c24030.map((row) => row.id);
  return line.humanVariantShareByIndustry?.[labels.indexOf(industryId)] ?? 0;
}

function assertConserved(result: M2aSimResult): void {
  const firmCount = industryAgentSlots().length;
  const includePublicFund = result.transition.ownership !== "PrivateOwners";
  let sum = 0;
  for (const id of allM2aAccountIds(result.summary.agentCount, firmCount, includePublicFund)) {
    const bal = result.summary.accountBalancesCents[id];
    expect(bal).toBeGreaterThanOrEqual(0);
    sum += bal;
  }
  expect(sum).toBe(result.summary.moneySupplyCents);
  for (const value of Object.values(result.summary.accountBalancesCents)) {
    expect(value).toBeGreaterThanOrEqual(0);
  }
}

describe("automation schedule", () => {
  it("fixed returns the run abundance on every day", () => {
    const path = resolveAutomationPath(0.5, { mode: "fixed", startLevel: 0, endLevel: 1 });
    expect(path.mode).toBe("fixed");
    expect(automationLevelAtDay(path, 0)).toBe(0.5);
    expect(automationLevelAtDay(path, 100)).toBe(0.5);
    expect(automationLevelAtDay(path, 3649)).toBe(0.5);
  });

  it("omitting the path is fixed at the abundance scalar", () => {
    const path = resolveAutomationPath(0.25);
    expect(path.mode).toBe("fixed");
    expect(path.horizonDays).toBe(3650);
    expect(automationLevelAtDay(path, 10)).toBe(0.25);
  });

  it("linear runs from 0 to 1 across the default horizon", () => {
    const path = resolveAutomationPath(0.5, "linear");
    expect(automationLevelAtDay(path, 0)).toBe(0);
    expect(automationLevelAtDay(path, 3649)).toBeCloseTo(1, 12);
    expect(automationLevelAtDay(path, 1824)).toBeCloseTo(1824 / 3649, 12);
    expect(automationLevelAtDay(path, 5000)).toBe(1);
  });

  it("logistic is 0.5 at the midpoint and near the endpoints of a 10-year horizon", () => {
    const path = resolveAutomationPath(0, "logistic");
    expect(path.midpointDay).toBe(1825);
    expect(path.steepness).toBe(0.005);
    expect(automationLevelAtDay(path, 1825)).toBeCloseTo(0.5, 12);
    expect(automationLevelAtDay(path, 0)).toBeLessThan(0.01);
    expect(automationLevelAtDay(path, 3649)).toBeGreaterThan(0.99);
    expect(automationLevelAtDay(path, 1000)).toBeLessThan(automationLevelAtDay(path, 1825));
    expect(automationLevelAtDay(path, 1825)).toBeLessThan(automationLevelAtDay(path, 2500));
  });

  it("rejects an unknown mode", () => {
    expect(() => parseAutomationPathMode("step")).toThrow(/Unknown automation path/);
    expect(() => resolveAutomationPath(0, { mode: "step" })).toThrow(/Unknown automation path/);
  });
});

describe("fixed path reproduces M2f", () => {
  it("implicit fixed a=0 and a=0.5 match the M2f hashes", () => {
    const a0 = fixedRun(0);
    const a05 = fixedRun(0.5);
    expect(sha(a0.dailyMetrics.join("\n"))).toBe(M2F_DAILY_A0);
    expect(sha(JSON.stringify(a0.summary))).toBe(M2F_SUMMARY_A0);
    expect(sha(a05.dailyMetrics.join("\n"))).toBe(M2F_DAILY_A05);
    expect(sha(JSON.stringify(a05.summary))).toBe(M2F_SUMMARY_A05);
    expect(a0.summary.accountBalancesCents[PUBLIC_FUND_ACCOUNT]).toBeUndefined();
    expect(a0.transition.ownership).toBe("PrivateOwners");
    expect(a0.transition.finalAbundance).toBe(0);
  });

  it("an explicit fixed path matches the implicit run", () => {
    const implicit = fixedRun(0.5);
    const explicit = fixedRun(0.5, "fixed");
    expect(explicit.dailyMetrics.join("\n")).toBe(implicit.dailyMetrics.join("\n"));
    expect(JSON.stringify(explicit.summary)).toBe(JSON.stringify(implicit.summary));
  });
});

describe("the sim follows a(t)", () => {
  it("linear day 0 matches fixed a=0 and the next day diverges", () => {
    const base = {
      seed: 42,
      days: 2,
      abundance: 0,
      policyName: "Mix",
      m2bEnabled: true,
    } as const;
    const fixed = runM2aSimulation(base);
    const linear = runM2aSimulation({
      ...base,
      automationPath: { mode: "linear", horizonDays: 5 },
    });
    expect(linear.dailyMetrics[0]).toBe(fixed.dailyMetrics[0]);
    expect(linear.dailyMetrics[1]).not.toBe(fixed.dailyMetrics[1]);
    expect(linear.transition.yearlyHarm[0].abundance).toBeGreaterThan(0);
  });

  it("a short logistic ramp moves prices, employment, and the human share", () => {
    const result = runM2aSimulation({
      seed: 42,
      days: 40,
      abundance: 0,
      policyName: "Mix",
      m2bEnabled: true,
      automationPath: {
        mode: "logistic",
        horizonDays: 40,
        midpointDay: 20,
        steepness: 0.35,
      },
    });
    const lines = linesOf(result);
    expect(lines[0].priceIndex).toBeGreaterThan(lines[20].priceIndex);
    expect(lines[20].priceIndex).toBeGreaterThan(lines[39].priceIndex);
    expect(lines[39].employed).toBeLessThan(lines[0].employed);
    expect(industryShare(lines[0], "educ")).toBeGreaterThan(industryShare(lines[39], "educ"));
    expect(industryShare(lines[39], "educ")).toBeLessThan(1);
    expect(result.transition.finalAbundance).toBeGreaterThan(0.9);
    assertConserved(result);
  });
});

describe("transition harm tracker", () => {
  it("nearest-rank percentiles and spell reset", () => {
    expect(percentileNearestRank([0, 0, 5, 10], 0.5)).toBe(0);
    expect(percentileNearestRank([0, 0, 5, 10], 0.9)).toBe(10);
    const world = buildM2aWorld(42);
    const needs = new Map<number, number>();
    for (const hh of world.households) needs.set(hh.id, 100);
    const tracker = new TransitionHarmTracker(world);
    for (let day = 0; day <= 369; day++) {
      const disposable = new Map<number, number>();
      for (const hh of world.households) {
        disposable.set(hh.id, hh.id === 0 && day >= 355 ? 0 : 100);
      }
      tracker.observe({
        dayIndex: day,
        abundance: 0,
        publicShare: 0,
        workOptionalShare: 0,
        giniDisposable: 0,
        householdDisposableCents: disposable,
        householdNeedsCents: needs,
      });
    }
    const rows = tracker.finish(369);
    expect(rows).toHaveLength(2);
    expect(rows[0].partial).toBe(false);
    expect(rows[0].days).toBe(365);
    expect(rows[0].spellDaysMax).toBe(10);
    expect(rows[1].partial).toBe(true);
    expect(rows[1].year).toBe(2);
    expect(rows[1].spellDaysMax).toBe(15);
    expect(rows[1].byAgeBand.map((band) => band.ageBand)).toEqual([
      "22-34",
      "35-49",
      "50-64",
      "65+",
    ]);
  });

  it("records shortfall share and depth by income quintile", () => {
    const world = buildM2aWorld(42);
    const quintiles = assignHouseholdIncomeQuintiles(world.households);
    const needs = new Map<number, number>();
    const disposable = new Map<number, number>();
    let q1 = 0;
    for (const hh of world.households) {
      needs.set(hh.id, 1000);
      const quintile = quintiles.get(hh.id);
      if (quintile === 1) q1 += 1;
      disposable.set(hh.id, quintile === 1 ? 100 : 5000);
    }
    const tracker = new TransitionHarmTracker(world);
    tracker.observe({
      dayIndex: 0,
      abundance: 0.2,
      publicShare: 0,
      workOptionalShare: 0.1,
      giniDisposable: 0.4,
      householdDisposableCents: disposable,
      householdNeedsCents: needs,
    });
    const row = tracker.finish(0)[0];
    expect(row.shortfallShare).toBeCloseTo(q1 / world.households.length, 12);
    expect(row.avgShortfallDepth).toBeCloseTo(0.9, 12);
    expect(row.byQuintile.find((q) => q.quintile === 1)?.shortfallShare).toBe(1);
    expect(row.byQuintile.find((q) => q.quintile === 5)?.shortfallShare).toBe(0);
    expect(row.workOptionalShare).toBe(0.1);
    expect(row.giniDisposable).toBe(0.4);
    const bandHouseholds = row.byAgeBand.reduce((s, band) => s + band.households, 0);
    expect(bandHouseholds).toBe(world.households.length);
  });
});

describe("producer ownership conserves money", () => {
  it("a=0 public and gradual runs match private daily metrics", () => {
    const base = {
      seed: 42,
      days: 15,
      abundance: 0,
      policyName: "Mix",
      landPolicyName: "CommunityLandTrust",
      m2bEnabled: true,
    } as const;
    const priv = runM2aSimulation({ ...base, ownership: "PrivateOwners" });
    const pub = runM2aSimulation({ ...base, ownership: "PublicFund" });
    const gradual = runM2aSimulation({ ...base, ownership: "GradualBuyIn" });
    expect(pub.dailyMetrics.join("\n")).toBe(priv.dailyMetrics.join("\n"));
    expect(gradual.dailyMetrics.join("\n")).toBe(priv.dailyMetrics.join("\n"));
    expect(pub.summary.accountBalancesCents[PUBLIC_FUND_ACCOUNT]).toBe(0);
    expect(gradual.transition.finalPublicShare).toBe(0);
    assertConserved(pub);
    assertConserved(gradual);
  });

  it("PublicFund and GradualBuyIn are deterministic at a=1 and the fund pays out", () => {
    const base = {
      seed: 42,
      days: 20,
      abundance: 1,
      policyName: "Mix",
      landPolicyName: "PrivateLandlords",
      m2bEnabled: true,
    } as const;
    const pubA = runM2aSimulation({ ...base, ownership: "PublicFund" });
    const pubB = runM2aSimulation({ ...base, ownership: "PublicFund" });
    const gradualA = runM2aSimulation({ ...base, ownership: "GradualBuyIn" });
    const gradualB = runM2aSimulation({ ...base, ownership: "GradualBuyIn" });
    expect(pubA.dailyMetrics.join("\n")).toBe(pubB.dailyMetrics.join("\n"));
    expect(gradualA.dailyMetrics.join("\n")).toBe(gradualB.dailyMetrics.join("\n"));
    expect(pubA.transition.finalPublicShare).toBeCloseTo(0.5, 12);
    expect(gradualA.transition.finalPublicShare).toBeGreaterThan(0);
    expect(gradualA.transition.finalPublicShare).toBeLessThan(0.5);
    expect(pubA.summary.accountBalancesCents[PUBLIC_FUND_ACCOUNT]).toBe(0);
    expect(gradualA.summary.accountBalancesCents[PUBLIC_FUND_ACCOUNT]).toBe(0);
    assertConserved(pubA);
    assertConserved(gradualA);
    const priv = runM2aSimulation({ ...base, ownership: "PrivateOwners" });
    expect(linesOf(pubA).at(-1)!.giniDisposable).toBeLessThan(
      linesOf(priv).at(-1)!.giniDisposable,
    );
  });
});
