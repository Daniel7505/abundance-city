/**
 * M3 transition report.
 * Mix × {PrivateLandlords, CommunityLandTrust} × {PrivateOwners, PublicFund, GradualBuyIn}.
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
const OWNERSHIP = ["PrivateOwners", "PublicFund", "GradualBuyIn"] as const;
const SEEDS = [42, 43, 44, 45, 46] as const;
const YEARS = [1, 3, 5, 7, 10] as const;

interface Job {
  seed: number;
  landPolicyName: string;
  ownership: string;
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
    for (const ownership of OWNERSHIP) {
      for (const seed of SEEDS) jobs.push({ seed, landPolicyName, ownership });
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
    "workOpt and giniDisposable are the year-end trailing windows (7-day and 30-day). Shortfall share and average depth cover every household-day in the year. Spell p90 is the nearest-rank p90 of each household's longest consecutive shortfall, in days, from day 0 through that year.",
  );
  console.log("");

  for (const land of LANDS) {
    for (const ownership of OWNERSHIP) {
      const group = results.filter(
        (result) => result.landPolicyName === land && result.ownership === ownership,
      );
      console.log(`## Mix + ${land} + ${ownership}`);
      console.log("");
      console.log("| year | workOpt | giniDisposable | shortfall share | avg depth | spell p90 |");
      console.log("|---:|---:|---:|---:|---:|---:|");
      for (const year of YEARS) {
        const rows = group.map((result) => rowFor(result, year));
        console.log(
          `| ${year} | ${cell(rows.map((row) => row.workOptionalShare), 4)} | ${cell(rows.map((row) => row.giniDisposable), 4)} | ${cell(rows.map((row) => row.shortfallShare), 4)} | ${cell(rows.map((row) => row.avgShortfallDepth), 4)} | ${cell(rows.map((row) => row.spellDaysP90), 1)} |`,
        );
      }
      console.log("");
      console.log(`Year-10 public share: ${cell(group.map((result) => result.finalPublicShare), 4)}`);
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
