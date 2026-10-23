/**
 * M3 transition report.
 * Mix × {PrivateLandlords, CommunityLandTrust} × {PrivateOwners, PublicFund, GradualBuyIn}.
 * The GradualBuyIn column uses ownership levy 0.6 so the fund holds about half the
 * producer by year 10. The coefficient default stays 0.05.
 * Logistic automation over 3650 days, seeds 42..46. Prints mean [min, max]. Does not write files.
 *
 * Usage: npx tsx scripts/m3-report.ts
 */
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { runM2aSimulation } from "../src/sim/m2a/engine.js";
import type { YearlyHarmRow } from "../src/sim/m2a/transition-harm.js";

const LANDS = ["PrivateLandlords", "CommunityLandTrust"] as const;
const SEEDS = [42, 43, 44, 45, 46] as const;
const YEARS = [1, 3, 5, 7, 10] as const;

/**
 * Seed 42, PrivateLandlords, logistic 3650 days, book $5,700,000: levy 0.6
 * ends at public share 0.486. The producer margin persists after the wage
 * claim, so the levy keeps buying through year 10. The default coefficient
 * levy 0.05 is unchanged.
 */
const COMPARISON_LEVY = 0.6;

const SCENARIOS = [
  { ownership: "PrivateOwners", label: "PrivateOwners", levy: undefined },
  { ownership: "PublicFund", label: "PublicFund", levy: undefined },
  { ownership: "GradualBuyIn", label: "GradualBuyIn levy 0.6", levy: COMPARISON_LEVY },
] as const;

interface Job {
  seed: number;
  landPolicyName: string;
  ownership: string;
  label: string;
  ownershipLevyRate?: number;
}

interface JobResult extends Job {
  ms: number;
  finalPublicShare: number;
  rows: YearlyHarmRow[];
}

function runJob(job: Job): JobResult {
  const started = Date.now();
  const result = runM2aSimulation({
    seed: job.seed,
    days: 3650,
    abundance: 0,
    policyName: "Mix",
    landPolicyName: job.landPolicyName,
    ownership: job.ownership,
    ownershipLevyRate: job.ownershipLevyRate,
    m2bEnabled: true,
    automationPath: "logistic",
  });
  return {
    ...job,
    ms: Date.now() - started,
    finalPublicShare: result.transition.finalPublicShare,
    rows: result.transition.yearlyHarm,
  };
}

if (!isMainThread) {
  parentPort!.postMessage(runJob(workerData as Job));
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function cell(values: number[], digits: number): string {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return `${mean(values).toFixed(digits)} [${lo.toFixed(digits)}, ${hi.toFixed(digits)}]`;
}

function rowFor(result: JobResult, year: number): YearlyHarmRow {
  const found = result.rows.find((row) => row.year === year);
  if (!found) throw new Error(`missing year ${year} for seed ${result.seed}`);
  return found;
}

function quintilePath(results: JobResult[]): string {
  const parts: string[] = [];
  for (const year of YEARS) {
    const means = [1, 2, 3, 4, 5].map((quintile) =>
      mean(
        results.map((result) => {
          const group = rowFor(result, year).byQuintile.find((q) => q.quintile === quintile);
          if (!group) throw new Error("missing quintile");
          return group.shortfallShare;
        }),
      ),
    );
    const monotone = means.every((share, i) => i === 0 || means[i - 1] + 1e-12 >= share);
    const order = means.map((share, i) => `Q${i + 1} ${share.toFixed(3)}`).join(", ");
    parts.push(`y${year}${monotone ? "" : " (not monotone)"}: ${order}`);
  }
  return parts.join("; ");
}

function worstQuintile(results: JobResult[]): string {
  let best: { id: string; year: number; share: number; depth: number } | null = null;
  for (const year of results[0].rows.map((row) => row.year)) {
    for (let quintile = 1; quintile <= 5; quintile++) {
      const groups = results.map((result) => {
        const group = rowFor(result, year).byQuintile.find((q) => q.quintile === quintile);
        if (!group) throw new Error("missing quintile");
        return group;
      });
      const share = mean(groups.map((group) => group.shortfallShare));
      const depth = mean(groups.map((group) => group.avgShortfallDepth));
      if (!best || share > best.share) best = { id: `Q${quintile}`, year, share, depth };
    }
  }
  if (!best) return "none";
  return `${best.id} in year ${best.year} (shortfall share ${best.share.toFixed(4)}, depth ${best.depth.toFixed(4)})`;
}

function worstAge(results: JobResult[]): string {
  let best: { id: string; year: number; share: number; depth: number } | null = null;
  const bands = results[0].rows[0].byAgeBand.map((band) => band.ageBand);
  for (const year of results[0].rows.map((row) => row.year)) {
    for (const band of bands) {
      const groups = results.map((result) => {
        const group = rowFor(result, year).byAgeBand.find((item) => item.ageBand === band);
        if (!group) throw new Error("missing age band");
        return group;
      });
      const share = mean(groups.map((group) => group.shortfallShare));
      const depth = mean(groups.map((group) => group.avgShortfallDepth));
      if (!best || share > best.share) best = { id: band, year, share, depth };
    }
  }
  if (!best) return "none";
  return `${best.id} in year ${best.year} (shortfall share ${best.share.toFixed(4)}, depth ${best.depth.toFixed(4)})`;
}

function runInWorker(job: Job): Promise<JobResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileURLToPath(import.meta.url), {
      workerData: job,
      execArgv: process.execArgv,
    });
    let settled = false;
    worker.once("message", (message: JobResult) => {
      settled = true;
      resolve(message);
    });
    worker.once("error", (err) => {
      settled = true;
      reject(err);
    });
    worker.once("exit", (code) => {
      if (!settled && code !== 0) reject(new Error(`worker exited ${code} for seed ${job.seed}`));
    });
  });
}

async function main(): Promise<void> {
  const jobs: Job[] = [];
  for (const landPolicyName of LANDS) {
    for (const scenario of SCENARIOS) {
      for (const seed of SEEDS) {
        jobs.push({
          seed,
          landPolicyName,
          ownership: scenario.ownership,
          label: scenario.label,
          ownershipLevyRate: scenario.levy,
        });
      }
    }
  }
  const parallelism = Math.max(1, Math.min(4, availableParallelism()));
  const started = Date.now();
  const results: JobResult[] = [];
  let cursor = 0;
  async function pump(): Promise<void> {
    while (cursor < jobs.length) {
      const job = jobs[cursor];
      cursor += 1;
      const result = await runInWorker(job);
      results.push(result);
      console.error(
        `done ${result.ownership} ${result.landPolicyName} seed ${result.seed} ${(result.ms / 1000).toFixed(1)}s`,
      );
    }
  }
  await Promise.all(Array.from({ length: parallelism }, () => pump()));

  console.log("# M3 transition report");
  console.log("");
  console.log(
    "Mix, adaptive human premium, m2b on. Logistic a(t) from 0 to 1 over 3650 days (placeholder midpoint 1825, steepness 0.005). Seeds 42–46. Each cell is mean [min, max].",
  );
  console.log(
    "Shortfall compares same-day disposable income to the settlement bill (food, electricity, and housing quantities priced on that day's goods price). Quintiles: year 1 is worldgen ACS income; later years re-rank by the previous year's total disposable income, Q1 lowest. Spells are the longest consecutive shortfall from day 0. Ever-short and chronic-short (more than half the year's days) are shares of households.",
  );
  console.log(
    `GradualBuyIn in this grid sets the levy knob to ${COMPARISON_LEVY}. The coefficient default remains 0.05.`,
  );
  console.log("");

  for (const land of LANDS) {
    for (const scenario of SCENARIOS) {
      const group = results.filter(
        (result) => result.landPolicyName === land && result.label === scenario.label,
      );
      console.log(`## Mix + ${land} + ${scenario.label}`);
      console.log("");
      console.log(
        "| year | workOpt | giniDisposable | shortfall share | avg depth | spell p50 | spell p90 | spell max | ever short | chronic short |",
      );
      console.log("|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
      for (const year of YEARS) {
        const rows = group.map((result) => rowFor(result, year));
        console.log(
          `| ${year} | ${cell(rows.map((row) => row.workOptionalShare), 4)} | ${cell(rows.map((row) => row.giniDisposable), 4)} | ${cell(rows.map((row) => row.shortfallShare), 4)} | ${cell(rows.map((row) => row.avgShortfallDepth), 4)} | ${cell(rows.map((row) => row.spellDaysP50), 1)} | ${cell(rows.map((row) => row.spellDaysP90), 1)} | ${cell(rows.map((row) => row.spellDaysMax), 1)} | ${cell(rows.map((row) => row.everShortShare), 4)} | ${cell(rows.map((row) => row.chronicShortShare), 4)} |`,
        );
      }
      console.log("");
      console.log(`Year-10 public share: ${cell(group.map((result) => result.finalPublicShare), 4)}`);
      console.log(`Quintile shortfall path: ${quintilePath(group)}`);
      console.log(`Worst quintile shortfall: ${worstQuintile(group)}`);
      console.log(`Worst age band shortfall: ${worstAge(group)}`);
      console.log("");
    }
  }

  const elapsed = (Date.now() - started) / 1000;
  const runMean = mean(results.map((result) => result.ms)) / 1000;
  console.log(
    `Runs: ${results.length}. Mean run ${runMean.toFixed(1)}s. Wall ${elapsed.toFixed(1)}s at parallelism ${parallelism}.`,
  );
}
