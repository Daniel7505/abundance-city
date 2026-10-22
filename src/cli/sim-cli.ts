import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runM1Simulation } from "../sim/m1/engine.js";
import { runM2aSimulation } from "../sim/m2a/engine.js";
import { runSimulation } from "../sim/engine.js";

function parseArgs(argv: string[]): {
  seed: number;
  ticks: number;
  days: number;
  abundance: number;
  policy: string;
  mixWeight: number;
  m1: boolean;
  m2a: boolean;
  m2b: boolean;
  humanPremiumMode: string | undefined;
  outDir: string;
} {
  let seed = 42;
  let ticks = 100;
  let days = 30;
  let abundance = 0.5;
  let policy = "Mix";
  let mixWeight = 0.5;
  let m1 = false;
  let m2a = false;
  let m2b = false;
  let humanPremiumMode: string | undefined;
  let outDir = "logs";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" && argv[i + 1]) {
      seed = Number(argv[++i]);
    } else if (arg === "--ticks" && argv[i + 1]) {
      ticks = Number(argv[++i]);
    } else if (arg === "--days" && argv[i + 1]) {
      days = Number(argv[++i]);
    } else if (arg === "--abundance" && argv[i + 1]) {
      abundance = Number(argv[++i]);
    } else if (arg === "--policy" && argv[i + 1]) {
      policy = argv[++i];
    } else if (arg === "--mix-weight" && argv[i + 1]) {
      mixWeight = Number(argv[++i]);
    } else if (arg === "--m1") {
      m1 = true;
    } else if (arg === "--m2a") {
      m2a = true;
    } else if (arg === "--m2b") {
      m2b = true;
      m2a = true;
    } else if (arg === "--human-premium" && argv[i + 1]) {
      humanPremiumMode = argv[++i];
    } else if (arg === "--out" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run sim -- [--m1|--m2a|--m2b] [--seed <n>] [--ticks <n>] [--days <n>] [--abundance <0-1>] [--policy <name>] [--human-premium fixed|adaptive] [--out <dir>]",
      );
      process.exit(0);
    }
  }

  if (!Number.isFinite(seed) || abundance < 0 || abundance > 1) {
    console.error("Invalid --seed or --abundance");
    process.exit(1);
  }
  if (!m1 && !m2a && (!Number.isInteger(ticks) || ticks < 0)) {
    console.error("Invalid --ticks");
    process.exit(1);
  }
  if ((m1 || m2a) && (!Number.isInteger(days) || days < 0)) {
    console.error("Invalid --days");
    process.exit(1);
  }

  if (
    humanPremiumMode !== undefined &&
    humanPremiumMode !== "fixed" &&
    humanPremiumMode !== "adaptive"
  ) {
    console.error("Invalid --human-premium (expected fixed or adaptive)");
    process.exit(1);
  }

  return { seed, ticks, days, abundance, policy, mixWeight, m1, m2a, m2b, humanPremiumMode, outDir };
}

function main(): void {
  const { seed, ticks, days, abundance, policy, mixWeight, m1, m2a, m2b, humanPremiumMode, outDir } =
    parseArgs(process.argv.slice(2));

  if (m2a) {
    const { dailyMetrics, summary } = runM2aSimulation({
      seed,
      days,
      abundance,
      policyName: policy,
      mixWeight,
      m2bEnabled: m2b,
      humanPremiumMode,
    });
    mkdirSync(outDir, { recursive: true });
    const mode = m2b ? "m2b" : "m2a";
    const tag = `${mode}-seed-${seed}-a-${abundance}-policy-${policy}-days-${days}`;
    const metricsPath = join(outDir, `${tag}.daily.jsonl`);
    const summaryPath = join(outDir, `${tag}.summary.json`);
    writeFileSync(
      metricsPath,
      dailyMetrics.join("\n") + (dailyMetrics.length ? "\n" : ""),
      "utf8",
    );
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
    console.log(`Wrote ${dailyMetrics.length} daily metric lines to ${metricsPath}`);
    console.log(`Wrote summary to ${summaryPath}`);
    return;
  }

  if (m1) {
    const { tickLogs, dailyMetrics, summary } = runM1Simulation({
      seed,
      days,
      abundance,
    });
    mkdirSync(outDir, { recursive: true });
    const tag = `seed-${seed}-a-${abundance}-days-${days}`;
    const logPath = join(outDir, `${tag}.jsonl`);
    const metricsPath = join(outDir, `${tag}.daily.jsonl`);
    const summaryPath = join(outDir, `${tag}.summary.json`);

    writeFileSync(
      logPath,
      tickLogs.join("\n") + (tickLogs.length ? "\n" : ""),
      "utf8",
    );
    writeFileSync(
      metricsPath,
      dailyMetrics.join("\n") + (dailyMetrics.length ? "\n" : ""),
      "utf8",
    );
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

    console.log(`Wrote ${tickLogs.length} tick log lines to ${logPath}`);
    console.log(`Wrote ${dailyMetrics.length} daily metric lines to ${metricsPath}`);
    console.log(`Wrote summary to ${summaryPath}`);
    return;
  }

  const { tickLogs, summary } = runSimulation({ seed, ticks });
  mkdirSync(outDir, { recursive: true });
  const logPath = join(outDir, `seed-${seed}-ticks-${ticks}.jsonl`);
  const summaryPath = join(outDir, `seed-${seed}-ticks-${ticks}.summary.json`);

  writeFileSync(logPath, tickLogs.join("\n") + (tickLogs.length ? "\n" : ""), "utf8");
  writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + "\n", "utf8");

  console.log(`Wrote ${tickLogs.length} log lines to ${logPath}`);
  console.log(`Wrote summary to ${summaryPath}`);
}

main();
