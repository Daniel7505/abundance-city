import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runSimulation } from "../sim/engine.js";

function parseArgs(argv: string[]): { seed: number; ticks: number; outDir: string } {
  let seed = 42;
  let ticks = 100;
  let outDir = "logs";

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--seed" && argv[i + 1]) {
      seed = Number(argv[++i]);
    } else if (arg === "--ticks" && argv[i + 1]) {
      ticks = Number(argv[++i]);
    } else if (arg === "--out" && argv[i + 1]) {
      outDir = argv[++i];
    } else if (arg === "--help" || arg === "-h") {
      console.log("Usage: npm run sim -- --seed <n> --ticks <n> [--out <dir>]");
      process.exit(0);
    }
  }

  if (!Number.isFinite(seed) || !Number.isInteger(ticks) || ticks < 0) {
    console.error("Invalid --seed or --ticks");
    process.exit(1);
  }

  return { seed, ticks, outDir };
}

function main(): void {
  const { seed, ticks, outDir } = parseArgs(process.argv.slice(2));
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
