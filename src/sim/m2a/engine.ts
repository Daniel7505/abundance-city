import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import {
  allM2aAccountIds,
  createM2aInitialBalances,
  m2aMoneySupplyCents,
} from "../../economy/m2a/accounts.js";
import { settleM2aDay } from "../../economy/m2a/daily.js";
import {
  applyLaborForAbundance,
  countDisplaced,
} from "../../economy/m2a/labor.js";
import {
  parseDividendPolicy,
  policyLabel,
  type DividendPolicy,
} from "../../economy/m2a/policy.js";
import { Ledger } from "../../economy/ledger.js";
import { buildM2aWorld } from "./worldgen.js";
import { M2aMetricsCollector, type DailyMetricLine } from "./metrics.js";
import { calibrationSnapshot } from "./calibration.js";

export interface M2aSimOptions {
  seed: number;
  days: number;
  abundance: number;
  policy?: DividendPolicy;
  policyName?: string;
  mixWeight?: number;
}

export interface M2aSimResult {
  dailyMetrics: string[];
  summary: {
    seed: number;
    days: number;
    abundance: number;
    policy: string;
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

function resolvePolicy(options: M2aSimOptions): DividendPolicy {
  if (options.policy) return options.policy;
  const name = options.policyName ?? m2aEconomy.defaultPolicy;
  const mix = options.mixWeight ?? m2aEconomy.defaultMixWeight;
  return parseDividendPolicy(name, mix);
}

export function runM2aSimulation(options: M2aSimOptions): M2aSimResult {
  const world = buildM2aWorld(options.seed);
  const firmCount = world.industrySlotsBase.length;
  const agentCount = world.agents.length;
  const known = new Set(allM2aAccountIds(agentCount, firmCount));
  const initialBalances = createM2aInitialBalances(world);
  const ledger = new Ledger(initialBalances, {
    knownAccounts: known,
    initialSupplyCents: m2aMoneySupplyCents(world),
  });

  const policy = resolvePolicy(options);
  applyLaborForAbundance(world, options.abundance);
  const calibrationDay0 = calibrationSnapshot(world);

  const dailyMetrics: string[] = [];
  const collector = new M2aMetricsCollector();
  let finalDayMetrics: DailyMetricLine | null = null;
  const totalTicks = options.days * m2aEconomy.ticksPerDay;

  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % m2aEconomy.ticksPerDay === m2aEconomy.settlementTickOfDay) {
      applyLaborForAbundance(world, options.abundance);
      const displaced = countDisplaced(world);
      const dayIndex = Math.floor(tick / m2aEconomy.ticksPerDay);
      const settlement = settleM2aDay(
        ledger,
        world,
        options.abundance,
        policy,
        dayIndex,
        tick,
        displaced,
      );
      const line = collector.record(settlement, world);
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
      policy: policyLabel(policy),
      mode: "m2a",
      moneySupplyCents: ledger.initialSupplyCents,
      agentCount,
      calibrationDay0,
      finalDayMetrics,
      accountBalancesCents,
    },
  };
}
