import { beforeAll, describe, expect, it } from "vitest";
import { runM2aSimulation, type M2aSimResult } from "../../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../../src/sim/m2a/metrics.js";

const DECADE = {
  seed: 42,
  days: 3650,
  abundance: 0,
  policyName: "Mix",
  landPolicyName: "PrivateLandlords",
  m2bEnabled: true,
  automationPath: "logistic" as const,
};

function conserved(result: M2aSimResult): void {
  let sum = 0;
  for (const value of Object.values(result.summary.accountBalancesCents)) {
    expect(value).toBeGreaterThanOrEqual(0);
    sum += value;
  }
  expect(sum).toBe(result.summary.moneySupplyCents);
}

let privateRun: M2aSimResult;
let privateAgain: M2aSimResult;
let publicRun: M2aSimResult;

beforeAll(() => {
  privateRun = runM2aSimulation({ ...DECADE, ownership: "PrivateOwners" });
  privateAgain = runM2aSimulation({ ...DECADE, ownership: "PrivateOwners" });
  publicRun = runM2aSimulation({ ...DECADE, ownership: "PublicFund" });
}, 400_000);

describe("M3 10-year logistic transition", () => {
  it("PrivateOwners conserves money, is deterministic, and follows the schedule", () => {
    expect(privateRun.dailyMetrics.join("\n")).toBe(privateAgain.dailyMetrics.join("\n"));
    expect(JSON.stringify(privateRun.transition.yearlyHarm)).toBe(
      JSON.stringify(privateAgain.transition.yearlyHarm),
    );
    expect(JSON.stringify(privateRun.summary.accountBalancesCents)).toBe(
      JSON.stringify(privateAgain.summary.accountBalancesCents),
    );
    conserved(privateRun);
    expect(privateRun.summary.agentCount).toBe(379);
    expect(privateRun.transition.yearlyHarm).toHaveLength(10);
    expect(privateRun.transition.yearlyHarm[0].partial).toBe(false);
    expect(privateRun.transition.yearlyHarm[0].abundance).toBeLessThan(0.02);
    expect(privateRun.transition.yearlyHarm[4].abundance).toBeGreaterThan(0.45);
    expect(privateRun.transition.yearlyHarm[4].abundance).toBeLessThan(0.55);
    expect(privateRun.transition.finalAbundance).toBeGreaterThan(0.99);
    const lines = privateRun.dailyMetrics.map((line) => JSON.parse(line) as DailyMetricLine);
    expect(lines[3649].priceIndex).toBeLessThan(lines[364].priceIndex);
    expect(lines[3649].employed).toBeLessThan(lines[364].employed);
    expect(privateRun.transition.yearlyHarm[9].giniDisposable).toBe(lines[3649].giniDisposable);
    expect(privateRun.transition.yearlyHarm[9].workOptionalShare).toBe(lines[3649].workOptionalShare);
  });

  it("PublicFund lowers year-10 giniDisposable versus PrivateOwners and conserves money", () => {
    conserved(publicRun);
    expect(publicRun.summary.accountBalancesCents.publicFund).toBe(0);
    expect(publicRun.transition.finalPublicShare).toBeCloseTo(0.5, 12);
    const publicGini = publicRun.transition.yearlyHarm[9].giniDisposable;
    const privateGini = privateRun.transition.yearlyHarm[9].giniDisposable;
    expect(publicGini).toBeLessThan(privateGini);
  });
});
