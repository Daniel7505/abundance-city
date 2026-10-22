import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseAutomationPathMode } from "../economy/m2a/automation-path.js";
import { parseLandPolicy } from "../economy/m2a/land-policy.js";
import { parseProducerOwnershipMode } from "../economy/m2a/producer-ownership.js";
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
  landPolicy: string | undefined;
  ownership: string | undefined;
  ownershipLevyRate: number | undefined;
  automationPath: string | undefined;
  automationHorizon: number | undefined;
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
  let landPolicy: string | undefined;
  let ownership: string | undefined;
  let ownershipLevyRate: number | undefined;
  let automationPath: string | undefined;
  let automationHorizon: number | undefined;
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
    } else if (arg === "--land-policy" && argv[i + 1]) {
      landPolicy = argv[++i];
    } else if (arg === "--ownership" && argv[i + 1]) {
      ownership = argv[++i];
    } else if (arg === "--ownership-levy" && argv[i + 1]) {
      ownershipLevyRate = Number(argv[++i]);
    } else if (arg === "--automation-path" && argv[i + 1]) {
      automationPath = argv[++i];
    } else if (arg === "--automation-horizon" && argv[i + 1]) {
      automationHorizon = Number(argv[++i]);
    } else if (arg === "--out" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: npm run sim -- [--m1|--m2a|--m2b] [--seed <n>] [--ticks <n>] [--days <n>] [--abundance <0-1>] [--policy <name>] [--land-policy <name>] [--ownership PrivateOwners|PublicFund|GradualBuyIn] [--ownership-levy <rate>] [--automation-path fixed|linear|logistic] [--automation-horizon <days>] [--human-premium fixed|adaptive] [--out <dir>]",
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
  if (automationHorizon !== undefined && (!Number.isInteger(automationHorizon) || automationHorizon < 1)) {
    console.error("Invalid --automation-horizon");
    process.exit(1);
  }
  if (
    ownershipLevyRate !== undefined &&
    (!Number.isFinite(ownershipLevyRate) || ownershipLevyRate < 0)
  ) {
    console.error("Invalid --ownership-levy");
    process.exit(1);
  }
  try {
    if (landPolicy !== undefined) parseLandPolicy(landPolicy);
    if (ownership !== undefined) parseProducerOwnershipMode(ownership);
    if (automationPath !== undefined) parseAutomationPathMode(automationPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  return {
    seed,
    ticks,
    days,
    abundance,
    policy,
    mixWeight,
    m1,
    m2a,
    m2b,
    humanPremiumMode,
    landPolicy,
    ownership,
    ownershipLevyRate,
    automationPath,
    automationHorizon,
    outDir,
  };
}

function main(): void {
  const {
    seed,
    ticks,
    days,
    abundance,
    policy,
    mixWeight,
    m1,
    m2a,
    m2b,
    humanPremiumMode,
    landPolicy,
    ownership,
    ownershipLevyRate,
    automationPath,
    automationHorizon,
    outDir,
  } = parseArgs(process.argv.slice(2));

  if (m2a) {
    const { dailyMetrics, summary, transition } = runM2aSimulation({
      seed,
      days,
      abundance,
      policyName: policy,
      mixWeight,
      m2bEnabled: m2b,
      humanPremiumMode,
      landPolicyName: landPolicy,
      ownership,
      ownershipLevyRate,
      automationPath:
        automationPath || automationHorizon
          ? {
              ...(automationPath ? { mode: automationPath } : {}),
              ...(automationHorizon ? { horizonDays: automationHorizon } : {}),
            }
          : undefined,
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
    writeFileSync(
      summaryPath,
      JSON.stringify({ ...summary, transition }, null, 2) + "\n",
      "utf8",
    );
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
