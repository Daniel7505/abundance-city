import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import {
  allM2aAccountIds,
  createM2aInitialBalances,
  m2aMoneySupplyCents,
} from "../../economy/m2a/accounts.js";
import { settleM2aDay } from "../../economy/m2a/daily.js";
import { applyAbundanceLayoffs } from "../../economy/m2a/jobs.js";
import { Ledger } from "../../economy/ledger.js";
import { buildM2aWorld } from "./worldgen.js";
import { M2aMetricsCollector, type DailyMetricLine } from "./metrics.js";
import { calibrationSnapshot } from "./calibration.js";

export interface M2aSimOptions {
  seed: number;
  days: number;
  abundance: number;
}

export interface M2aSimResult {
  dailyMetrics: string[];
  summary: {
    seed: number;
    days: number;
    abundance: number;
    mode: "m2a";
    moneySupplyCents: number;
    agentCount: number;
    calibrationDay0: ReturnType<typeof calibrationSnapshot>;
    finalDayMetrics: DailyMetricLine | null;
    accountBalancesCents: Record<string, number>;
  };
}

function assertMoneyInvariant(
  ledger: Ledger,
  known: ReadonlySet<string>,
): void {
  if (ledger.totalSupplyCents() !== ledger.initialSupplyCents) {
    throw new Error("Money supply changed");
  }
  for (const id of known) {
    if (ledger.getBalance(id) < 0) {
      throw new Error(`Negative balance on ${id}`);
    }
  }
}

export function runM2aSimulation(options: M2aSimOptions): M2aSimResult {
  const world = buildM2aWorld(options.seed);
  const firmCount = world.industrySlotsBase.length;
  const agentCount = world.agents.length;
  const known = new Set(allM2aAccountIds(agentCount, firmCount));
  const ledger = new Ledger(createM2aInitialBalances(agentCount, firmCount), {
    knownAccounts: known,
    initialSupplyCents: m2aMoneySupplyCents(agentCount, firmCount),
  });

  applyAbundanceLayoffs(world, options.abundance);
  const calibrationDay0 = calibrationSnapshot(world);

  const dailyMetrics: string[] = [];
  const collector = new M2aMetricsCollector();
  let finalDayMetrics: DailyMetricLine | null = null;
  const totalTicks = options.days * m2aEconomy.ticksPerDay;

  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % m2aEconomy.ticksPerDay === m2aEconomy.settlementTickOfDay) {
      applyAbundanceLayoffs(world, options.abundance);
      const dayIndex = Math.floor(tick / m2aEconomy.ticksPerDay);
      const wageIncomeByAgent = new Map<number, number>();
      const settlement = settleM2aDay(
        ledger,
        world,
        options.abundance,
        dayIndex,
        tick,
      );
      for (const a of world.agents) {
        if (a.laborStatus === "employed") {
          wageIncomeByAgent.set(a.id, a.dailyWageCents);
        }
      }
      const line = collector.record(settlement, world, wageIncomeByAgent);
      dailyMetrics.push(JSON.stringify(line));
      finalDayMetrics = line;
    }
    assertMoneyInvariant(ledger, known);
  }

  const accountBalancesCents: Record<string, number> = {};
  for (const id of known) {
    accountBalancesCents[id] = ledger.getBalance(id);
  }

  return {
    dailyMetrics,
    summary: {
      seed: options.seed,
      days: options.days,
      abundance: options.abundance,
      mode: "m2a",
      moneySupplyCents: ledger.initialSupplyCents,
      agentCount,
      calibrationDay0,
      finalDayMetrics,
      accountBalancesCents,
    },
  };
}
