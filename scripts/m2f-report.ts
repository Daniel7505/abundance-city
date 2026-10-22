/**
 * M2f report: fixed vs adaptive human-variant shares and a=1 Mix rows.
 * Usage: npx tsx scripts/m2f-report.ts
 */
import { getTown } from "../src/town/lindsborg.js";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { HumanPremiumMode } from "../src/economy/m2a/human-variant.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

function run(
  abundance: number,
  landPolicyName: string,
  humanPremiumMode: HumanPremiumMode,
): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance,
    policyName: "Mix",
    landPolicyName,
    m2bEnabled: true,
    humanPremiumMode,
  });
  return JSON.parse(dailyMetrics.at(-1)!) as DailyMetricLine;
}

function q1HousingShare(line: DailyMetricLine): number {
  const q1 = line.quintileDistribution?.find((q) => q.quintile === 1);
  return q1?.housingShareOfNeeds ?? 0;
}

const town = getTown();
const labels = town.industry_employment_c24030.map((r) => r.id);

console.log("## Human-variant share by industry (365d, seed 42, Mix, PrivateLandlords)\n");
for (const a of [0.5, 1] as const) {
  const fixed = run(a, "PrivateLandlords", "fixed");
  const adaptive = run(a, "PrivateLandlords", "adaptive");
  console.log(`\n### a=${a}\n`);
  console.log("| industry | fixed | adaptive |");
  console.log("|---|---:|---:|");
  for (let i = 0; i < labels.length; i++) {
    const fixedShare = fixed.humanVariantShareByIndustry?.[i] ?? 0;
    const adaptiveShare = adaptive.humanVariantShareByIndustry?.[i] ?? 0;
    if (fixedShare <= 0 && adaptiveShare <= 0) continue;
    console.log(`| ${labels[i]} | ${fixedShare.toFixed(4)} | ${adaptiveShare.toFixed(4)} |`);
  }
}

console.log("\n## a=1 Mix row (365d, seed 42)\n");
console.log("| mode | land | workOpt | giniFactor | giniDisposable | wagesPaid | Q1 housing/needs |");
console.log("|---|---|---:|---:|---:|---:|---:|");
for (const mode of ["fixed", "adaptive"] as const) {
  for (const land of ["PrivateLandlords", "CommunityLandTrust"] as const) {
    const line = run(1, land, mode);
    console.log(
      `| ${mode} | ${land} | ${line.workOptionalShare.toFixed(4)} | ${line.giniFactor.toFixed(4)} | ${line.giniDisposable.toFixed(4)} | ${line.wagesPaidCents} | ${q1HousingShare(line).toFixed(4)} |`,
    );
  }
}
