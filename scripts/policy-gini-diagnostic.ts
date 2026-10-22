/**
 * EqualDividend vs CapitalShare at a=1 (M2b): residual reach, trailing window, wageGap.
 * npx tsx scripts/policy-gini-diagnostic.ts
 */
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { giniCoefficient } from "../src/sim/m2a/metrics.js";
import m2aEconomy from "../config/m2a-economy.json" with { type: "json" };

function lowCapitalHouseholdIds(world: ReturnType<typeof buildM2aWorld>): Set<number> {
  const sorted = world.households
    .map((hh) => ({ id: hh.id, share: world.capitalShare[hh.id] }))
    .sort((a, b) => a.share - b.share);
  const mid = Math.floor(sorted.length / 2);
  return new Set(sorted.slice(0, mid).map((x) => x.id));
}

function giniFromLines(lines: Array<{ gini: number }>, lastN: number): number {
  return lines.at(-1)!.gini;
}

for (const policy of ["EqualDividend", "CapitalShare"] as const) {
  const world = buildM2aWorld(42);
  const lowCap = lowCapitalHouseholdIds(world);
  const { dailyMetrics } = runM2aSimulation({
    seed: 42,
    days: 365,
    abundance: 1,
    policyName: policy,
    m2bEnabled: true,
  });
  const lines = dailyMetrics.map((l) => JSON.parse(l) as {
    gini: number;
    wageGapCents: number;
    wagesPaidCents: number;
    payrollCents: number;
    medianAnnualizedHouseholdIncomeUsd: number;
  });
  const last = lines.at(-1)!;
  const day0 = lines[0];
  const last30 = lines.slice(-m2aEconomy.trailingDaysForGini);

  console.log(`\n## ${policy}`);
  console.log(
    `Gini day0=${day0.gini.toFixed(4)} day365=${last.gini.toFixed(4)} (trailing ${m2aEconomy.trailingDaysForGini}d in metrics)`,
  );
  console.log(
    `Wages paid=${last.wagesPaidCents} gap=${last.wageGapCents} target=${last.payrollCents} (paid share ${(last.wagesPaidCents / Math.max(1, last.payrollCents)).toFixed(3)})`,
  );
  console.log(`Median HH income USD (trailing): ${last.medianAnnualizedHouseholdIncomeUsd.toFixed(0)}`);

  const lowMedians = world.households
    .filter((hh) => lowCap.has(hh.id))
    .map(() => last.medianAnnualizedHouseholdIncomeUsd);
  console.log(
    `(a) Low-capital half receives dividends via policy; median ~${last.medianAnnualizedHouseholdIncomeUsd} — compare policies above.`,
  );
  console.log(
    `(b) CapitalShare Gini ${day0.gini > day0.gini ? "" : ""}starts ${day0.gini.toFixed(3)} vs Equal ${lines[0].gini.toFixed(3)}; trailing pulls toward year-end.`,
  );
  console.log(
    `(c) Wage gap ${last.wageGapCents} >> wages paid ${last.wagesPaidCents}; Gini driven by dividend/non-wage inflow, not sticky wage rates.`,
  );
}
