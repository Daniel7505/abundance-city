import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import {
  allM2aAccountIds,
  createM2aInitialBalances,
  m2aMoneySupplyCents,
} from "../../economy/m2a/accounts.js";
import { HouseholdConsumptionState } from "../../economy/m2a/consumption.js";
import { settleM2aDay } from "../../economy/m2a/daily.js";
import {
  applyLaborForAbundance,
  countDisplaced,
} from "../../economy/m2a/labor.js";
import { basketPriceIndex, industryPricesCents } from "../../economy/m2a/prices.js";
import {
  applyM2bLaborForDay,
  countDisplacedM2b,
  initM2bLaborState,
} from "../../economy/m2b/labor.js";
import m2bEconomy from "../../../config/m2b-economy.json" with { type: "json" };
import {
  parseDividendPolicy,
  policyLabel,
  type DividendPolicy,
} from "../../economy/m2a/policy.js";
import {
  landPolicyLabel,
  parseLandPolicy,
  type LandPolicy,
} from "../../economy/m2a/land-policy.js";
import {
  createHumanPremiumState,
  parseHumanPremiumMode,
  type HumanPremiumMode,
} from "../../economy/m2a/human-variant.js";
import { Ledger } from "../../economy/ledger.js";
import { buildM2aWorld } from "./worldgen.js";
import {
  M2aMetricsCollector,
  type DailyMetricLine,
  type DistributionProbeSnapshot,
} from "./metrics.js";
import { calibrationSnapshot } from "./calibration.js";

export interface M2aSimOptions {
  seed: number;
  days: number;
  abundance: number;
  policy?: DividendPolicy;
  policyName?: string;
  mixWeight?: number;
  m2bEnabled?: boolean;
  landPolicy?: LandPolicy;
  landPolicyName?: string;
  humanPremiumMode?: HumanPremiumMode | string;
  /**
   * Throw if one run exceeds this many wall-clock milliseconds.
   * Under Vitest, defaults to VITEST_SIM_BUDGET_MS or 180_000 so a hung run fails
   * instead of stalling the worker. Unset outside tests. 0 disables the guard.
   */
  wallClockBudgetMs?: number;
}

export interface M2aSimResult {
  dailyMetrics: string[];
  distributionProbe: DistributionProbeSnapshot | null;
  summary: {
    seed: number;
    days: number;
    abundance: number;
    policy: string;
    landPolicy: string;
    humanPremiumMode: HumanPremiumMode;
    mode: "m2a" | "m2b";
    m2bEnabled: boolean;
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

function resolveLandPolicy(options: M2aSimOptions): LandPolicy {
  if (options.landPolicy) return options.landPolicy;
  const name = options.landPolicyName ?? "PrivateLandlords";
  return parseLandPolicy(name);
}

function resolveHumanPremiumMode(options: M2aSimOptions): HumanPremiumMode {
  if (options.humanPremiumMode === "fixed" || options.humanPremiumMode === "adaptive") {
    return options.humanPremiumMode;
  }
  return parseHumanPremiumMode(options.humanPremiumMode);
}

function resolveWallClockBudgetMs(options: M2aSimOptions): number | undefined {
  if (options.wallClockBudgetMs === 0) return undefined;
  if (options.wallClockBudgetMs !== undefined) return options.wallClockBudgetMs;
  if (process.env.VITEST) {
    const fromEnv = Number(process.env.VITEST_SIM_BUDGET_MS ?? 180_000);
    return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : undefined;
  }
  return undefined;
}

export function runM2aSimulation(options: M2aSimOptions): M2aSimResult {
  const m2bEnabled = options.m2bEnabled ?? false;
  const world = buildM2aWorld(options.seed);
  const firmCount = world.industrySlotsBase.length;
  const agentCount = world.agents.length;
  const known = new Set(allM2aAccountIds(agentCount, firmCount));
  const initialBalances = createM2aInitialBalances(world);
  const ledger = new Ledger(initialBalances, {
    knownAccounts: known,
    initialSupplyCents: m2aMoneySupplyCents(world),
    recordTransfers: false,
  });

  const policy = resolvePolicy(options);
  const landPolicy = resolveLandPolicy(options);
  const humanPremiumMode = resolveHumanPremiumMode(options);
  const humanPremiumState = createHumanPremiumState(firmCount);
  const wallClockBudgetMs = resolveWallClockBudgetMs(options);
  const wallClockStarted = wallClockBudgetMs === undefined ? 0 : Date.now();
  if (m2bEnabled) {
    const refAbundance = m2bEconomy.referenceAbundanceForDemand;
    const refPrices = industryPricesCents(world, refAbundance);
    const refIndex = basketPriceIndex(world, refAbundance, refPrices);
    initM2bLaborState(world, refIndex);
    applyM2bLaborForDay(
      world,
      options.abundance,
      0,
      basketPriceIndex(world, options.abundance, industryPricesCents(world, options.abundance)),
    );
  } else {
    applyLaborForAbundance(world, options.abundance);
  }
  const calibrationDay0 = calibrationSnapshot(world);

  const dailyMetrics: string[] = [];
  const consumptionState = new HouseholdConsumptionState(world);
  const collector = new M2aMetricsCollector({ m2bEnabled });
  collector.bindWorld(world);
  let finalDayMetrics: DailyMetricLine | null = null;
  let distributionProbe: DistributionProbeSnapshot | null = null;
  const totalTicks = options.days * m2aEconomy.ticksPerDay;

  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % m2aEconomy.ticksPerDay === m2aEconomy.settlementTickOfDay) {
      const dayIndex = Math.floor(tick / m2aEconomy.ticksPerDay);
      const prices = industryPricesCents(world, options.abundance);
      const priceIndex = basketPriceIndex(world, options.abundance, prices);

      let displaced: number;
      if (m2bEnabled) {
        applyM2bLaborForDay(world, options.abundance, dayIndex, priceIndex);
        displaced = countDisplacedM2b(world);
      } else {
        applyLaborForAbundance(world, options.abundance);
        displaced = countDisplaced(world);
      }

      if (
        wallClockBudgetMs !== undefined &&
        Date.now() - wallClockStarted > wallClockBudgetMs
      ) {
        throw new Error(
          `Simulation exceeded wall-clock budget of ${wallClockBudgetMs}ms at day ${dayIndex} (possible hang)`,
        );
      }

      const settlement = settleM2aDay(
        ledger,
        world,
        options.abundance,
        policy,
        landPolicy,
        dayIndex,
        tick,
        displaced,
        {
          useQuantityNeeds: m2bEnabled,
          consumptionState,
          humanPremiumState,
          humanPremiumMode,
        },
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

  distributionProbe = collector.exportDistributionProbe(
    world,
    options.abundance,
    `${policyLabel(policy)}|${landPolicyLabel(landPolicy)}`,
  );

  return {
    dailyMetrics,
    distributionProbe,
    summary: {
      seed: options.seed,
      days: options.days,
      abundance: options.abundance,
      policy: policyLabel(policy),
      landPolicy: landPolicyLabel(landPolicy),
      humanPremiumMode,
      mode: m2bEnabled ? "m2b" : "m2a",
      m2bEnabled,
      moneySupplyCents: ledger.initialSupplyCents,
      agentCount,
      calibrationDay0,
      finalDayMetrics,
      accountBalancesCents,
    },
  };
}
