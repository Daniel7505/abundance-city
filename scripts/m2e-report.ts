/**
 * M2e report: policy grid, Mix sweep, human-variant shares.
 * Usage: npx tsx scripts/m2e-report.ts
 */
import { getTown } from "../src/town/lindsborg.js";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

const DIVIDEND_POLICIES = ["Mix", "EqualDividend", "CapitalShare", "TaxAndDividend"] as const;
const LAND_POLICIES = ["PrivateLandlords", "LandValueTax", "CommunityLandTrust"] as const;

function run(abundance: number, policyName: string, landPolicyName: string): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance,
    policyName,
    landPolicyName,
    m2bEnabled: true,
  });
  return JSON.parse(dailyMetrics.at(-1)!) as DailyMetricLine;
}

function q1HousingShare(line: DailyMetricLine): number {
  const q1 = line.quintileDistribution?.find((q) => q.quintile === 1);
  return q1?.housingShareOfNeeds ?? 0;
}

console.log("## Policy grid at a=1 (365d, seed 42, M2b on)\n");
console.log("| dividend | land | workOpt | giniDisposable | wagesPaid | Q1 housing/needs |");
console.log("|---|---|---:|---:|---:|---:|");
for (const dividend of DIVIDEND_POLICIES) {
  for (const land of LAND_POLICIES) {
    const line = run(1, dividend, land);
    console.log(
      `| ${dividend} | ${land} | ${line.workOptionalShare.toFixed(4)} | ${line.giniDisposable.toFixed(4)} | ${line.wagesPaidCents} | ${q1HousingShare(line).toFixed(4)} |`,
    );
  }
}

console.log("\n## Mix + PrivateLandlords sweep (compare M2d)\n");
console.log("| a | workOpt | giniFactor | giniDisposable | wagesPaid | Q1 housing/needs |");
console.log("|---|---:|---:|---:|---:|---:|");
for (const a of [0, 0.5, 1] as const) {
  const line = run(a, "Mix", "PrivateLandlords");
  console.log(
    `| ${a} | ${line.workOptionalShare.toFixed(4)} | ${line.giniFactor.toFixed(4)} | ${line.giniDisposable.toFixed(4)} | ${line.wagesPaidCents} | ${q1HousingShare(line).toFixed(4)} |`,
  );
}

const town = getTown();
const labels = town.industry_employment_c24030.map((r) => r.id);
console.log("\n## Human-variant share of goods spending by industry\n");
for (const a of [0.5, 1] as const) {
  const line = run(a, "Mix", "PrivateLandlords");
  const shares = line.humanVariantShareByIndustry ?? [];
  console.log(`\n### a=${a}\n`);
  console.log("| industry | human share |");
  console.log("|---|---:|");
  for (let i = 0; i < labels.length; i++) {
    if ((shares[i] ?? 0) <= 0 && (line.byIndustryDistribution?.[i]?.wagesPaidCents ?? 0) <= 0) {
      continue;
    }
    console.log(`| ${labels[i]} | ${(shares[i] ?? 0).toFixed(4)} |`);
  }
}
