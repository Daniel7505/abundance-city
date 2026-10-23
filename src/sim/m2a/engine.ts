import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import {
  allM2aAccountIds,
  createM2aInitialBalances,
  m2aMoneySupplyCents,
  PUBLIC_FUND_ACCOUNT,
} from "../../economy/m2a/accounts.js";
import {
  automationLevelAtDay,
  resolveAutomationPath,
  type AutomationPathOption,
  type ResolvedAutomationPath,
} from "../../economy/m2a/automation-path.js";
import {
  createProducerOwnershipState,
  parseProducerOwnershipMode,
  type ProducerOwnershipMode,
} from "../../economy/m2a/producer-ownership.js";
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
import { parseWagePolicy, type WagePolicyName } from "../../economy/m2a/wage-policy.js";
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
import { TransitionHarmTracker, type YearlyHarmRow } from "./transition-harm.js";

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
  /** fixed (default) keeps `abundance` every day. linear and logistic follow a(t). */
  automationPath?: AutomationPathOption;
  /** PrivateOwners (default) is the historical producer residual. */
  ownership?: ProducerOwnershipMode | string;
  /**
   * GradualBuyIn profit levy. Omitted uses producerOwnership.profitLevyRate.
   * Does not change the default model.
   */
  ownershipLevyRate?: number;
  /**
   * MarketWages (default) fits each human firm's payroll to its own receipts.
   * WageGuarantee tops payroll up from the automated producer.
   */
  wagePolicy?: WagePolicyName | string;
  /**
   * Throw if one run exceeds this many wall-clock milliseconds.
   * Under Vitest, defaults to VITEST_SIM_BUDGET_MS or 180_000 so a hung run fails
   * instead of stalling the worker. Unset outside tests. 0 disables the guard.
   */
  wallClockBudgetMs?: number;
}

export interface TransitionReport {
  automationPath: ResolvedAutomationPath;
  finalAbundance: number;
  ownership: ProducerOwnershipMode;
  finalPublicShare: number;
  yearlyHarm: YearlyHarmRow[];
}

export interface M2aSimResult {
  dailyMetrics: string[];
  distributionProbe: DistributionProbeSnapshot | null;
  transition: TransitionReport;
  summary: {
    seed: number;
    days: number;
    abundance: number;
    policy: string;
    landPolicy: string;
    wagePolicy: WagePolicyName;
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
  const policy = resolvePolicy(options);
  const landPolicy = resolveLandPolicy(options);
  const wagePolicy = parseWagePolicy(
    typeof options.wagePolicy === "string" ? options.wagePolicy : undefined,
  );
  const humanPremiumMode = resolveHumanPremiumMode(options);
  const automationPath = resolveAutomationPath(options.abundance, options.automationPath);
  const ownershipMode = parseProducerOwnershipMode(options.ownership);
  const ownershipState = createProducerOwnershipState(ownershipMode, {
    profitLevyRate: options.ownershipLevyRate,
  });
  const includePublicFund = ownershipMode !== "PrivateOwners";
  const known = new Set(allM2aAccountIds(agentCount, firmCount, includePublicFund));
  const initialBalances = createM2aInitialBalances(world);
  if (includePublicFund) initialBalances.set(PUBLIC_FUND_ACCOUNT, 0);
  const ledger = new Ledger(initialBalances, {
    knownAccounts: known,
    initialSupplyCents: m2aMoneySupplyCents(world),
    recordTransfers: false,
  });
  const abundanceAt = (dayIndex: number) => automationLevelAtDay(automationPath, dayIndex);
  const humanPremiumState = createHumanPremiumState(firmCount);
  const wallClockBudgetMs = resolveWallClockBudgetMs(options);
  const wallClockStarted = wallClockBudgetMs === undefined ? 0 : Date.now();
  const a0 = abundanceAt(0);
  if (m2bEnabled) {
    const refAbundance = m2bEconomy.referenceAbundanceForDemand;
    const refPrices = industryPricesCents(world, refAbundance);
    const refIndex = basketPriceIndex(world, refAbundance, refPrices);
    initM2bLaborState(world, refIndex);
    applyM2bLaborForDay(
      world,
      a0,
      0,
      basketPriceIndex(world, a0, industryPricesCents(world, a0)),
    );
  } else {
    applyLaborForAbundance(world, a0);
  }
  const calibrationDay0 = calibrationSnapshot(world);

  const dailyMetrics: string[] = [];
  const consumptionState = new HouseholdConsumptionState(world);
  const collector = new M2aMetricsCollector({ m2bEnabled });
  collector.bindWorld(world);
  const harm = new TransitionHarmTracker(world);
  let finalDayMetrics: DailyMetricLine | null = null;
  let distributionProbe: DistributionProbeSnapshot | null = null;
  const totalTicks = options.days * m2aEconomy.ticksPerDay;

  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % m2aEconomy.ticksPerDay === m2aEconomy.settlementTickOfDay) {
      const dayIndex = Math.floor(tick / m2aEconomy.ticksPerDay);
      const abundance = abundanceAt(dayIndex);
      const prices = industryPricesCents(world, abundance);
      const priceIndex = basketPriceIndex(world, abundance, prices);

      let displaced: number;
      if (m2bEnabled) {
        applyM2bLaborForDay(world, abundance, dayIndex, priceIndex);
        displaced = countDisplacedM2b(world);
      } else {
        applyLaborForAbundance(world, abundance);
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
        abundance,
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
          producerOwnership: ownershipState,
          wagePolicy,
        },
      );
      const line = collector.record(settlement, world);
      harm.observe({
        dayIndex,
        abundance,
        publicShare: ownershipState.publicShare,
        workOptionalShare: line.workOptionalShare,
        giniDisposable: line.giniDisposable,
        householdDisposableCents: settlement.householdDisposableInflowCents,
        householdNeedsCents: settlement.householdNeedsCents,
      });
      dailyMetrics.push(JSON.stringify(line));
      finalDayMetrics = line;
    }
    assertMoneyInvariant(ledger, known);
  }

  const accountBalancesCents: Record<string, number> = {};
  for (const id of known) {
    accountBalancesCents[id] = ledger.getBalance(id);
  }

  const finalDay = options.days > 0 ? options.days - 1 : 0;
  const finalAbundance = abundanceAt(finalDay);
  const yearlyHarm = harm.finish(options.days > 0 ? options.days - 1 : -1);
  distributionProbe = collector.exportDistributionProbe(
    world,
    finalAbundance,
    `${policyLabel(policy)}|${landPolicyLabel(landPolicy)}`,
  );

  return {
    dailyMetrics,
    distributionProbe,
    transition: {
      automationPath,
      finalAbundance,
      ownership: ownershipMode,
      finalPublicShare: ownershipState.publicShare,
      yearlyHarm,
    },
    summary: {
      seed: options.seed,
      days: options.days,
      abundance: options.abundance,
      policy: policyLabel(policy),
      landPolicy: landPolicyLabel(landPolicy),
      wagePolicy,
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
