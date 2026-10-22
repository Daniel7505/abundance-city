/**
 * M2c distribution and policy-tie probe (365d, seed 42, M2b on).
 * Usage: npx tsx scripts/distribution-report.ts
 */
import { getTown } from "../src/town/lindsborg.js";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

const POLICIES_PROBE = ["Mix", "CapitalShare", "TaxAndDividend", "EqualDividend"] as const;
const ABUNDANCES = [0, 0.5, 1] as const;

function runLine(abundance: number, policyName: string): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance,
    policyName,
    m2bEnabled: true,
  });
  return JSON.parse(dailyMetrics.at(-1)!) as DailyMetricLine;
}

function pctChange(from: number, to: number): string {
  if (from === 0) return "n/a";
  return `${(((to - from) / from) * 100).toFixed(1)}%`;
}

console.log("## (1) Policy-tie probe at a=1 (workOptionalShare)\n");
console.log(
  "After task-level automatability, transfer policies can change workOptionalShare (CapitalShare below Mix/Tax).",
  "EqualDividend still lifts the most households above the needs threshold.\n",
);
console.log("| policy | workOpt 7d | workOpt 30d | workOpt 90d |");
console.log("|--------|----------:|------------:|------------:|");
for (const policy of POLICIES_PROBE) {
  const { distributionProbe } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance: 1,
    policyName: policy,
    m2bEnabled: true,
  });
  const w = distributionProbe!.workOptionalShareByWindow;
  console.log(
    `| ${policy} | ${w["7"].toFixed(4)} | ${w["30"].toFixed(4)} | ${w["90"].toFixed(4)} |`,
  );
}

console.log("\n### Coverage ratio deciles (non-wage disposable / needs, 30d window)\n");
for (const policy of POLICIES_PROBE) {
  const { distributionProbe } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance: 1,
    policyName: policy,
    m2bEnabled: true,
  });
  const dec = distributionProbe!.coverageRatioDecilesByWindow["30"];
  console.log(
    `${policy}: ${dec.map((v, i) => `d${i + 1}=${v.toFixed(3)}`).join(" ")}`,
  );
}

const town = getTown();
const industryLabels = town.industry_employment_c24030.map((r) => r.id);

console.log("\n## (2) Industry table (Mix, vs a=0 baseline)\n");
const baseline = runLine(0, "Mix");
const baselineByInd = new Map(
  baseline.byIndustryDistribution!.map((r) => [r.industryIndex, r]),
);

console.log(
  "| industry | a | price | Δprice vs a=0 | jobs | Δjobs | hours | Δhours | wages |",
);
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|");
for (const a of ABUNDANCES) {
  const line = a === 0 ? baseline : runLine(a, "Mix");
  for (const row of line.byIndustryDistribution!) {
    const base = baselineByInd.get(row.industryIndex)!;
    const label = industryLabels[row.industryIndex] ?? String(row.industryIndex);
    console.log(
      `| ${label} | ${a} | ${row.priceCents} | ${a === 0 ? "—" : pctChange(base.priceCents, row.priceCents)} | ${row.jobs} | ${a === 0 ? "—" : row.jobs - base.jobs} | ${row.laborHours.toFixed(1)} | ${a === 0 ? "—" : (row.laborHours - base.laborHours).toFixed(1)} | ${row.wagesPaidCents} |`,
    );
  }
}

console.log("\n## (2) Quintile table (ACS income quintile, Mix)\n");
console.log(
  "| Q | a | wage¢ | Δwage | transfer¢ | needs¢ | food¢ | housing¢ | elec¢ | needs/income | housing/needs |",
);
console.log("|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
const quintileBaseline = new Map(
  baseline.quintileDistribution!.map((q) => [q.quintile, q]),
);
for (const a of ABUNDANCES) {
  const line = a === 0 ? baseline : runLine(a, "Mix");
  for (const q of line.quintileDistribution!) {
    const base = quintileBaseline.get(q.quintile)!;
    console.log(
      `| ${q.quintile} | ${a} | ${Math.round(q.wageIncomeCents)} | ${a === 0 ? "—" : pctChange(base.wageIncomeCents, q.wageIncomeCents)} | ${Math.round(q.transferIncomeCents)} | ${Math.round(q.needsCents)} | ${Math.round(q.foodNeedsCents)} | ${Math.round(q.housingNeedsCents)} | ${Math.round(q.electricityNeedsCents)} | ${q.needsShareOfIncome.toFixed(3)} | ${q.housingShareOfNeeds.toFixed(4)} |`,
    );
  }
}

console.log("\n## (3) Hypothesis: housing falls least; Q1 wage falls fastest\n");
const q1Base = quintileBaseline.get(1)!;
const q5Base = quintileBaseline.get(5)!;
const lineHalf = runLine(0.5, "Mix");
const lineFull = runLine(1, "Mix");
const q1Half = lineHalf.quintileDistribution!.find((q) => q.quintile === 1)!;
const q5Half = lineHalf.quintileDistribution!.find((q) => q.quintile === 5)!;
const q1Full = lineFull.quintileDistribution!.find((q) => q.quintile === 1)!;
const q5Full = lineFull.quintileDistribution!.find((q) => q.quintile === 5)!;

const housingDropQ1 =
  q1Base.housingNeedsCents > 0
    ? (q1Base.housingNeedsCents - q1Full.housingNeedsCents) / q1Base.housingNeedsCents
    : 0;
const foodDropQ1 =
  q1Base.foodNeedsCents > 0
    ? (q1Base.foodNeedsCents - q1Full.foodNeedsCents) / q1Base.foodNeedsCents
    : 0;
const needsDropQ1 = (q1Base.needsCents - q1Full.needsCents) / q1Base.needsCents;
const wageDropQ1 = (q1Base.wageIncomeCents - q1Full.wageIncomeCents) / q1Base.wageIncomeCents;
const wageDropQ5 = (q5Base.wageIncomeCents - q5Full.wageIncomeCents) / q5Base.wageIncomeCents;

const housingShareRiseQ1 =
  lineFull.quintileDistribution!.find((q) => q.quintile === 1)!.housingShareOfNeeds -
  q1Base.housingShareOfNeeds;

console.log(
  `Q1 wage drop a=0→1: ${(wageDropQ1 * 100).toFixed(1)}%; Q5 wage drop: ${(wageDropQ5 * 100).toFixed(1)}%`,
);
console.log(
  `Q1 total needs drop a=0→1: ${(needsDropQ1 * 100).toFixed(1)}%; Q1 food needs drop: ${(foodDropQ1 * 100).toFixed(1)}%; Q1 housing needs drop: ${(housingDropQ1 * 100).toFixed(1)}%`,
);
console.log(`Q1 housing share of needs change a=0→1: ${(housingShareRiseQ1 * 100).toFixed(1)} pp`);

const supports =
  wageDropQ1 > wageDropQ5 &&
  housingDropQ1 < foodDropQ1 &&
  housingShareRiseQ1 > 0;
console.log(
  `\nVerdict: ${supports ? "SUPPORTED" : "NOT SUPPORTED"} — ` +
    `Q1 wage drop (${(wageDropQ1 * 100).toFixed(1)}%) vs Q5 (${(wageDropQ5 * 100).toFixed(1)}%); ` +
    `Q1 food drop ${(foodDropQ1 * 100).toFixed(1)}% vs housing drop ${(housingDropQ1 * 100).toFixed(1)}% ` +
    `(housing rent index scales with goods basket, so food/automation goods fall much faster than imputed housing).`,
);
