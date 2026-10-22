import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import type { DailySettlementResult, IndustryDayStats } from "../../economy/m2a/daily.js";
import { m2aMoneySupplyCents } from "../../economy/m2a/accounts.js";
import type { M2aWorld } from "./types.js";
import {
  MAX_TRAILING_PROBE_DAYS,
  aggregateQuintileDistribution,
  assignHouseholdIncomeQuintiles,
  coverageRatioDeciles,
  industryDistributionFromSettlement,
  pushTrailingDay,
  workOptionalShareForWindow,
  type HouseholdTrailingDay,
  type IndustryDistributionSnapshot,
  type QuintileDistributionBucket,
} from "./distribution.js";

export type { IndustryDistributionSnapshot, QuintileDistributionBucket };

export interface DailyMetricLine {
  day: number;
  tick: number;
  workOptionalShare: number;
  /** @deprecated Use giniFactor or giniDisposable */
  gini: number;
  giniFactor: number;
  giniDisposable: number;
  medianAnnualizedHouseholdIncomeUsd: number;
  firmBalancesCents?: number[];
  agentCashCentsTotal?: number;
  firmRevenueCentsTotal?: number;
  producerInflowCents?: number;
  unmetNeed: number;
  shortHouseholds: number;
  byIndustry: IndustryDayStats[];
  costPerPerson: number;
  totalEnergyWh: number;
  humanEnergyWh: number;
  automatedEnergyWh: number;
  jobs: number;
  employed: number;
  displaced: number;
  priceIndex: number;
  moneySupply: number;
  wageSubsidyCents: number;
  payrollCents: number;
  wagesPaidCents: number;
  wageGapCents: number;
  totalLaborHours: number;
  ownershipDistributedCents: number;
  queued?: number;
  retired?: number;
  queueHiresCumulative?: number;
  medianReemploymentDelayDays?: number;
  queueHiresToday?: number;
  separationsToday?: number;
  laborPartition?: {
    employed: number;
    queued: number;
    retired: number;
    displacedUnqueued: number;
    nlf: number;
  };
  quintileDistribution?: QuintileDistributionBucket[];
  byIndustryDistribution?: IndustryDistributionSnapshot[];
}

export interface DistributionProbeSnapshot {
  policy: string;
  abundance: number;
  workOptionalShareByWindow: Record<string, number>;
  coverageRatioDecilesByWindow: Record<string, number[]>;
}

interface TrailingHouseholdWindow {
  days: Array<{ nonWageDisposable: number; needs: number }>;
}

interface TrailingIncomeWindow {
  dailyWageOwnershipCents: number[];
  dailyMedianIncomeCents: number[];
  dailyDisposableCents: number[];
}

export function giniCoefficient(values: number[]): number {
  const sorted = values.filter((v) => v >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return 0;
  const sum = sorted.reduce((s, v) => s + v, 0);
  if (sum === 0) return 0;
  let weighted = 0;
  for (let i = 0; i < n; i++) {
    weighted += (2 * (i + 1) - n - 1) * sorted[i];
  }
  return weighted / (n * sum);
}

function trailingMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export class M2aMetricsCollector {
  private householdWindows = new Map<number, TrailingHouseholdWindow>();
  private distributionWindows = new Map<number, HouseholdTrailingDay[]>();
  private incomeWindows = new Map<number, TrailingIncomeWindow>();
  private readonly m2bEnabled: boolean;
  private readonly quintileByHousehold = new Map<number, number>();

  constructor(options: { m2bEnabled?: boolean } = {}) {
    this.m2bEnabled = options.m2bEnabled ?? false;
  }

  bindWorld(world: M2aWorld): void {
    const quintiles = assignHouseholdIncomeQuintiles(world.households);
    this.quintileByHousehold.clear();
    for (const [id, q] of quintiles) this.quintileByHousehold.set(id, q);
  }

  exportDistributionProbe(world: M2aWorld, abundance: number, policy: string): DistributionProbeSnapshot {
    const windows = [7, 30, 90] as const;
    const workOptionalShareByWindow: Record<string, number> = {};
    const coverageRatioDecilesByWindow: Record<string, number[]> = {};
    for (const w of windows) {
      workOptionalShareByWindow[String(w)] = workOptionalShareForWindow(
        world,
        this.distributionWindows,
        w,
        this.m2bEnabled,
      );
      coverageRatioDecilesByWindow[String(w)] = coverageRatioDeciles(
        world,
        this.distributionWindows,
        w,
        this.m2bEnabled,
      );
    }
    return { policy, abundance, workOptionalShareByWindow, coverageRatioDecilesByWindow };
  }

  record(settlement: DailySettlementResult, world: M2aWorld): DailyMetricLine {
    const trailingOptional = m2aEconomy.trailingDaysForWorkOptional;
    const trailingGini = m2aEconomy.trailingDaysForGini;
    const priceIndexBase = world.referenceBasketPriceIndex;

    for (const hh of world.households) {
      const wageOwnership =
        settlement.householdWageOwnershipInflowCents.get(hh.id) ?? 0;
      const disposable = settlement.householdDisposableInflowCents.get(hh.id) ?? 0;
      const wages = settlement.householdWageInflowCents.get(hh.id) ?? 0;
      const policy = settlement.householdPolicyInflowCents.get(hh.id) ?? 0;
      const needs = settlement.householdNeedsCents.get(hh.id) ?? 0;
      const housingNeeds = settlement.householdHousingNeedsCents.get(hh.id) ?? 0;
      const foodNeeds = settlement.householdFoodNeedsCents.get(hh.id) ?? 0;
      const electricityNeeds = settlement.householdElectricityNeedsCents.get(hh.id) ?? 0;
      const transfer = settlement.householdTransferInflowCents.get(hh.id) ?? 0;
      const nonWageDisposable = disposable - wages;

      let distWindow = this.distributionWindows.get(hh.id);
      if (!distWindow) {
        distWindow = [];
        this.distributionWindows.set(hh.id, distWindow);
      }
      pushTrailingDay(
        distWindow,
        {
          wageCents: wages,
          transferCents: transfer,
          disposableCents: disposable,
          needsCents: needs,
          housingNeedsCents: housingNeeds,
          foodNeedsCents: foodNeeds,
          electricityNeedsCents: electricityNeeds,
          nonWageDisposableCents: nonWageDisposable,
        },
        MAX_TRAILING_PROBE_DAYS,
      );

      let window = this.householdWindows.get(hh.id);
      if (!window) {
        window = { days: [] };
        this.householdWindows.set(hh.id, window);
      }
      window.days.push({ nonWageDisposable, needs });
      if (window.days.length > trailingOptional) window.days.shift();

      let incomeWindow = this.incomeWindows.get(hh.id);
      if (!incomeWindow) {
        incomeWindow = {
          dailyWageOwnershipCents: [],
          dailyMedianIncomeCents: [],
          dailyDisposableCents: [],
        };
        this.incomeWindows.set(hh.id, incomeWindow);
      }
      const medianIncomeDaily = disposable - policy;
      incomeWindow.dailyWageOwnershipCents.push(wageOwnership);
      incomeWindow.dailyMedianIncomeCents.push(medianIncomeDaily);
      incomeWindow.dailyDisposableCents.push(disposable);
      if (incomeWindow.dailyWageOwnershipCents.length > trailingGini) {
        incomeWindow.dailyWageOwnershipCents.shift();
        incomeWindow.dailyMedianIncomeCents.shift();
        incomeWindow.dailyDisposableCents.shift();
      }
    }

    let optionalHouseholds = 0;
    for (const hh of world.households) {
      const hasAutomationEmployment =
        this.m2bEnabled &&
        hh.agentIds.some((id) => {
          const a = world.agents[id];
          return a.laborStatus === "employed" && !a.demandSlotEmployment;
        });
      if (hasAutomationEmployment) continue;
      const window = this.householdWindows.get(hh.id)!;
      const sumNonWageDisposable = window.days.reduce((s, d) => s + d.nonWageDisposable, 0);
      const sumNeeds = window.days.reduce((s, d) => s + d.needs, 0);
      if (sumNonWageDisposable >= sumNeeds) optionalHouseholds += 1;
    }
    const workOptionalShare = optionalHouseholds / world.households.length;

    const annualizedFactorUsd: number[] = [];
    const annualizedDisposableUsd: number[] = [];
    const annualizedHouseholdIncomeUsd: number[] = [];
    for (const hh of world.households) {
      const incomeWindow = this.incomeWindows.get(hh.id)!;
      const meanWageOwnership = trailingMean(incomeWindow.dailyWageOwnershipCents);
      const meanMedianIncome = trailingMean(incomeWindow.dailyMedianIncomeCents);
      const meanDisposable = trailingMean(incomeWindow.dailyDisposableCents);
      annualizedFactorUsd.push((meanWageOwnership / 100) * 365);
      annualizedDisposableUsd.push((meanDisposable / 100) * 365);
      annualizedHouseholdIncomeUsd.push((meanMedianIncome / 100) * 365);
    }
    const sortedAnnual = [...annualizedHouseholdIncomeUsd].sort((a, b) => a - b);
    const mid = Math.floor(sortedAnnual.length / 2);
    const medianAnnualizedHouseholdIncomeUsd =
      sortedAnnual.length === 0
        ? 0
        : sortedAnnual.length % 2 === 0
          ? (sortedAnnual[mid - 1] + sortedAnnual[mid]) / 2
          : sortedAnnual[mid];

    const giniFactor = giniCoefficient(annualizedFactorUsd);
    const giniDisposable = giniCoefficient(annualizedDisposableUsd);

    const quintileDistribution = aggregateQuintileDistribution(
      world,
      this.quintileByHousehold,
      this.distributionWindows,
      trailingGini,
    );
    const byIndustryDistribution = industryDistributionFromSettlement(settlement);

    const jobs = settlement.byIndustry.reduce((s, row) => s + row.jobs, 0);
    const avgNeeds =
      world.households.reduce(
        (s, hh) => s + (settlement.householdNeedsCents.get(hh.id) ?? 0),
        0,
      ) / world.households.length;

    const line: DailyMetricLine = {
      day: settlement.day,
      tick: settlement.tick,
      workOptionalShare,
      gini: giniFactor,
      giniFactor,
      giniDisposable,
      medianAnnualizedHouseholdIncomeUsd,
      unmetNeed: settlement.unmetNeedCents,
      shortHouseholds: settlement.shortHouseholds,
      byIndustry: settlement.byIndustry,
      costPerPerson: Math.round(avgNeeds),
      totalEnergyWh: settlement.goodsUnitsPurchased,
      humanEnergyWh: settlement.goodsUnitsPurchased * (1 - settlement.employed / world.agents.length),
      automatedEnergyWh: settlement.goodsUnitsPurchased * (settlement.employed / world.agents.length),
      jobs,
      employed: settlement.employed,
      displaced: settlement.displaced,
      priceIndex:
        priceIndexBase > 0 ? (settlement.priceIndex / priceIndexBase) * 100 : settlement.priceIndex,
      moneySupply: m2aMoneySupplyCents(world),
      wageSubsidyCents: settlement.wageSubsidyCents,
      payrollCents: settlement.payrollCents,
      wagesPaidCents: settlement.wagesPaidCents,
      wageGapCents: settlement.wageGapCents,
      totalLaborHours: settlement.totalLaborHours,
      ownershipDistributedCents: settlement.ownershipDistributedCents,
      firmBalancesCents: settlement.firmBalancesCents,
      agentCashCentsTotal: settlement.agentCashCentsTotal,
      firmRevenueCentsTotal: settlement.firmRevenueCentsTotal,
      producerInflowCents: settlement.producerInflowCents,
      quintileDistribution,
      byIndustryDistribution,
    };
    if (this.m2bEnabled) {
      line.queued = settlement.queued;
      line.retired = settlement.retired;
      line.queueHiresCumulative = settlement.queueHiresCumulative;
      line.medianReemploymentDelayDays = settlement.medianReemploymentDelayDays;
      line.queueHiresToday = settlement.queueHiresToday;
      line.separationsToday = settlement.separationsToday;
      line.laborPartition = settlement.laborPartition ?? undefined;
    }
    return line;
  }
}
