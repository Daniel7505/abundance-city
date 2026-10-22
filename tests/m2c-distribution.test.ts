import { describe, expect, it } from "vitest";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";
import {
  QUINTILE_COUNT,
  aggregateQuintileDistribution,
  assignHouseholdIncomeQuintiles,
  sumQuintileField,
  type HouseholdTrailingDay,
} from "../src/sim/m2a/distribution.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";

function lastMetrics(days: number, abundance: number): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days,
    abundance,
    policyName: "Mix",
    m2bEnabled: true,
  });
  return JSON.parse(dailyMetrics.at(-1)!) as DailyMetricLine;
}

describe("M2c distribution metrics", () => {
  it("quintile buckets cover all households and sum wage/transfer/needs to household totals", () => {
    const line = lastMetrics(60, 0);
    const buckets = line.quintileDistribution;
    const industries = line.byIndustryDistribution;
    expect(buckets).toBeDefined();
    expect(industries).toBeDefined();
    expect(buckets!.length).toBe(QUINTILE_COUNT);
    expect(industries!.length).toBeGreaterThan(0);

    const householdCount = buckets!.reduce((s, b) => s + b.households, 0);
    expect(householdCount).toBe(buildM2aWorld(42).households.length);

    const wageSum = sumQuintileField(buckets!, "wageIncomeCents");
    const transferSum = sumQuintileField(buckets!, "transferIncomeCents");
    const needsSum = sumQuintileField(buckets!, "needsCents");
    const housingSum = sumQuintileField(buckets!, "housingNeedsCents");

    expect(wageSum).toBeGreaterThan(0);
    expect(needsSum).toBeGreaterThan(0);
    expect(housingSum).toBeGreaterThan(0);
    expect(wageSum + transferSum).toBeLessThanOrEqual(line.moneySupply);

    for (const b of buckets!) {
      expect(b.housingShareOfNeeds).toBeGreaterThan(0);
      expect(b.housingShareOfNeeds).toBeLessThanOrEqual(1);
    }

    const world = buildM2aWorld(42);
    const quintiles = assignHouseholdIncomeQuintiles(world.households);
    const synthetic = new Map<number, HouseholdTrailingDay[]>();
    for (const hh of world.households) {
      synthetic.set(hh.id, [
        {
          wageCents: 100 + hh.id,
          transferCents: 10,
          disposableCents: 120,
          needsCents: 80,
          housingNeedsCents: 30,
          foodNeedsCents: 40,
          electricityNeedsCents: 10,
          nonWageDisposableCents: 20,
        },
      ]);
    }
    const agg = aggregateQuintileDistribution(world, quintiles, synthetic, 1);
    const synthWage = agg.reduce((s, b) => s + b.wageIncomeCents, 0);
    let direct = 0;
    for (const hh of world.households) direct += 100 + hh.id;
    expect(synthWage).toBe(direct);
  });

  it("industry distribution wages match byIndustry payroll on last day", () => {
    const line = lastMetrics(30, 0.5);
    const dist = line.byIndustryDistribution!;
    const legacy = line.byIndustry;
    expect(dist.length).toBe(legacy.length);
    const distWages = dist.reduce((s, r) => s + r.wagesPaidCents, 0);
    const legacyWages = legacy.reduce((s, r) => s + r.wages, 0);
    expect(distWages).toBe(legacyWages);
  });

  it("policy-tie probe: Mix/Capital/Tax workOptionalShare matches at a=1 with 7d window", () => {
    const policies = ["Mix", "CapitalShare", "TaxAndDividend"] as const;
    const shares = policies.map((policyName) => {
      const { distributionProbe } = runM2aSimulation({
        seed: 42,
        days: 365,
        abundance: 1,
        policyName,
        m2bEnabled: true,
      });
      return distributionProbe!.workOptionalShareByWindow["7"];
    });
    expect(shares[0]).toBeCloseTo(shares[1], 4);
    expect(shares[1]).toBeCloseTo(shares[2], 4);
  });
});
