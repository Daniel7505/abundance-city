/**
 * 365d Mix sweep report (M2b on). Usage: npx tsx scripts/mix-sweep-report.ts
 */
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { DailyMetricLine } from "../src/sim/m2a/metrics.js";

const policies = ["Mix", "EqualDividend", "CapitalShare", "TaxAndDividend"] as const;

function lastLine(days: number, abundance: number, policyName: string): DailyMetricLine {
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days,
    abundance,
    policyName,
    m2bEnabled: true,
  });
  return JSON.parse(dailyMetrics[dailyMetrics.length - 1]) as DailyMetricLine;
}

console.log("## 365d Mix sweep (seed 42, M2b on)\n");
console.log(
  "| a | workOpt | giniFactor | giniDisposable | employed | hours | wageGap | priceIndex |",
);
console.log(
  "|---|--------:|-----------:|---------------:|---------:|------:|--------:|-----------:|",
);
for (let a = 0; a <= 1.0001; a += 0.1) {
  const abundance = Math.round(a * 10) / 10;
  const l = lastLine(365, abundance, "Mix");
  console.log(
    `| ${abundance.toFixed(1)} | ${l.workOptionalShare.toFixed(4)} | ${l.giniFactor.toFixed(4)} | ${l.giniDisposable.toFixed(4)} | ${l.employed} | ${l.totalLaborHours.toFixed(1)} | ${l.wageGapCents} | ${Math.round(l.priceIndex)} |`,
  );
}

console.log("\n## 365d policy contrast at a=1 (M2b on)\n");
console.log(
  "| policy | workOpt | giniFactor | giniDisposable | employed | hours | wageGap | priceIndex |",
);
console.log(
  "|--------|--------:|-----------:|---------------:|---------:|------:|--------:|-----------:|",
);
for (const policy of policies) {
  const l = lastLine(365, 1, policy);
  console.log(
    `| ${policy} | ${l.workOptionalShare.toFixed(4)} | ${l.giniFactor.toFixed(4)} | ${l.giniDisposable.toFixed(4)} | ${l.employed} | ${l.totalLaborHours.toFixed(1)} | ${l.wageGapCents} | ${Math.round(l.priceIndex)} |`,
  );
}
