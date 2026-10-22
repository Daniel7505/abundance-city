import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { distributePoolByPolicy } from "./distribute.js";
import {
  createHumanPremiumState,
  humanVariantSharesForDay,
  parseHumanPremiumMode,
  type HumanPremiumMode,
  type HumanPremiumState,
} from "./human-variant.js";
import { settleLandRentPolicy, type LandPolicy } from "./land-policy.js";
import { basketPriceIndex, industryPricesCents } from "./prices.js";
import type { DividendPolicy } from "./policy.js";
import { dwellingRentCentsPerDay } from "../../sim/m2a/housing-rent.js";
import {
  LANDLORD_ACCOUNT,
  PRODUCER_ACCOUNT,
  TREASURY_ACCOUNT,
  agentAccount,
  firmAccount,
} from "./accounts.js";
import { countEmployed } from "./labor.js";
import type { Ledger } from "../ledger.js";
import type { Household, M2aWorld } from "../../sim/m2a/types.js";
import {
  householdDailyNeedsCentsFromQuantities,
  householdDailyNeedsCentsLegacy,
} from "../../sim/m2a/needs.js";
import { needsPriceContext } from "../../sim/m2a/needs-prices.js";
import { laborPartitionCounts, medianReemploymentDelayDays } from "../m2b/labor.js";
import { settleFirmPayroll } from "./firm-payroll.js";
import { laborHoursFromPaid } from "./wage-pool.js";
import type { ProducerOwnershipState } from "./producer-ownership.js";
import { settleProducerAccount } from "./producer-settlement.js";
import { HouseholdConsumptionState } from "./consumption.js";

export interface IndustryDayStats {
  jobs: number;
  wages: number;
  output: number;
}

export interface DailySettlementResult {
  day: number;
  tick: number;
  pricesCents: number[];
  priceIndex: number;
  employed: number;
  displaced: number;
  unmetNeedCents: number;
  shortHouseholds: number;
  totalLaborHours: number;
  goodsUnitsPurchased: number;
  byIndustry: IndustryDayStats[];
  householdNonWageIncomeCents: Map<number, number>;
  householdNeedsCents: Map<number, number>;
  householdWageInflowCents: Map<number, number>;
  /** Wages plus ownership dividends (ACS factor-income Gini). */
  householdWageOwnershipInflowCents: Map<number, number>;
  /** All cash inflows: wages, ownership, SS/UI, and policy transfers. */
  householdDisposableInflowCents: Map<number, number>;
  householdPolicyInflowCents: Map<number, number>;
  /** SS, UI, and policy transfers (excludes ownership dividends). */
  householdTransferInflowCents: Map<number, number>;
  householdHousingNeedsCents: Map<number, number>;
  householdFoodNeedsCents: Map<number, number>;
  householdElectricityNeedsCents: Map<number, number>;
  wagePaidByAgent: Map<number, number>;
  wageSubsidyCents: number;
  /** Full-rate wage targets (not paid amounts). */
  payrollCents: number;
  wagesPaidCents: number;
  wageGapCents: number;
  producerInflowCents: number;
  ownershipDistributedCents: number;
  policyDistributedCents: number;
  queued: number;
  retired: number;
  queueHiresCumulative: number;
  medianReemploymentDelayDays: number;
  queueHiresToday: number;
  separationsToday: number;
  laborPartition: ReturnType<typeof laborPartitionCounts> | null;
  firmBalancesCents: number[];
  agentCashCentsTotal: number;
  firmRevenueCentsTotal: number;
  humanVariantSpendByIndustry: number[];
  goodsSpendByIndustry: number[];
}

export interface SettleM2aDayOptions {
  useQuantityNeeds?: boolean;
  consumptionState?: HouseholdConsumptionState;
  /** Persisted across days. A fresh state each call only applies one day of evidence. */
  humanPremiumState?: HumanPremiumState;
  humanPremiumMode?: HumanPremiumMode;
  /** Persisted across days. PrivateOwners keeps the historical producer residual path. */
  producerOwnership?: ProducerOwnershipState;
}

function payFromHousehold(
  ledger: Ledger,
  hh: Household,
  amount: number,
  payer: (agentId: number, maxCents: number) => number,
): number {
  let remaining = amount;
  let paidTotal = 0;
  for (const agentId of hh.agentIds) {
    if (remaining <= 0) break;
    const paid = payer(agentId, remaining);
    paidTotal += paid;
    remaining -= paid;
  }
  return paidTotal;
}

interface PurchaseRevenue {
  firm: number[];
  producer: number;
  humanVariantSpendByIndustry: number[];
  goodsSpendByIndustry: number[];
}

function allocateByWeight(total: number, weights: number[]): number[] {
  if (total <= 0) return weights.map(() => 0);
  const wsum = weights.reduce((s, n) => s + n, 0);
  if (wsum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / wsum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((s, v) => s + v, 0);
  const order = weights
    .map((w, i) => ({ i, frac: raw[i] - floors[i] }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floors[order[k % order.length].i] += 1;
  }
  return floors;
}

function routeGoodsPurchase(
  ledger: Ledger,
  agentId: number,
  amount: number,
  payrollByIndustry: number[],
  industryCount: number,
  reason: string,
  humanShares: number[],
  revenue?: PurchaseRevenue,
): number {
  if (amount <= 0) return 0;
  const firmShares = allocateByWeight(amount, payrollByIndustry);
  let paid = 0;
  for (let ind = 0; ind < industryCount; ind++) {
    const share = firmShares[ind];
    if (share <= 0) continue;
    const humanShare = humanShares[ind] ?? 1;
    const humanCents = Math.round(share * humanShare);
    const autoCents = share - humanCents;
    if (humanCents > 0) {
      const slice = ledger.transferUpTo(
        agentAccount(agentId),
        firmAccount(ind),
        humanCents,
        `${reason}_human`,
      );
      if (revenue) {
        revenue.firm[ind] += slice;
        revenue.humanVariantSpendByIndustry[ind] += slice;
        revenue.goodsSpendByIndustry[ind] += slice;
      }
      paid += slice;
    }
    if (autoCents > 0) {
      const slice = ledger.transferUpTo(
        agentAccount(agentId),
        PRODUCER_ACCOUNT,
        autoCents,
        `${reason}_auto`,
      );
      if (revenue) {
        revenue.producer += slice;
        revenue.goodsSpendByIndustry[ind] += slice;
      }
      paid += slice;
    }
  }
  return paid;
}

function payLandRentComponent(
  ledger: Ledger,
  agentId: number,
  amount: number,
): number {
  if (amount <= 0) return 0;
  return ledger.transferUpTo(agentAccount(agentId), LANDLORD_ACCOUNT, amount, "land_rent");
}

export function settleM2aDay(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  policy: DividendPolicy,
  landPolicy: LandPolicy,
  dayIndex: number,
  tick: number,
  displaced: number,
  settleOptions: SettleM2aDayOptions = {},
): DailySettlementResult {
  const useQuantityNeeds = settleOptions.useQuantityNeeds ?? false;
  const consumptionState =
    settleOptions.consumptionState ?? new HouseholdConsumptionState(world);
  const industryCount = world.industrySlotsBase.length;
  const prices = industryPricesCents(world, abundance);
  const jobsByIndustry = Array.from({ length: industryCount }, () => 0);
  const payrollByIndustry = Array.from({ length: industryCount }, () => 0);
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      jobsByIndustry[a.industryIndex] += 1;
      payrollByIndustry[a.industryIndex] += a.dailyWageCents;
    }
  }
  const byIndustry: IndustryDayStats[] = jobsByIndustry.map((jobs) => ({
    jobs,
    wages: 0,
    output: jobs,
  }));

  let unmetNeedCents = 0;
  let shortHouseholds = 0;
  let goodsUnitsPurchased = 0;
  const householdNonWageIncome = new Map<number, number>();
  const householdNeeds = new Map<number, number>();
  const householdWageInflow = new Map<number, number>();
  const householdWageOwnershipInflow = new Map<number, number>();
  const householdDisposableInflow = new Map<number, number>();
  const householdPolicyInflow = new Map<number, number>();
  const householdTransferInflow = new Map<number, number>();
  const householdHousingNeeds = new Map<number, number>();
  const householdFoodNeeds = new Map<number, number>();
  const householdElectricityNeeds = new Map<number, number>();
  const wagePaidByAgent = new Map<number, number>();
  const agentOwnershipDividends = new Map<number, number>();
  const agentPolicyDividends = new Map<number, number>();
  const wageSubsidyCents = 0;
  const firmRevenue = Array.from({ length: industryCount }, () => 0);
  const purchaseRevenue: PurchaseRevenue = {
    firm: firmRevenue,
    producer: 0,
    humanVariantSpendByIndustry: Array.from({ length: industryCount }, () => 0),
    goodsSpendByIndustry: Array.from({ length: industryCount }, () => 0),
  };
  const agentLandDividends = new Map<number, number>();

  const needsPrices = useQuantityNeeds ? needsPriceContext(world, abundance) : null;
  const humanPremiumState =
    settleOptions.humanPremiumState ?? createHumanPremiumState(industryCount);
  const humanShares = humanVariantSharesForDay(
    world,
    abundance,
    humanPremiumState,
    settleOptions.humanPremiumMode ?? parseHumanPremiumMode(undefined),
  );

  for (const hh of world.households) {
    const needs = useQuantityNeeds
      ? householdDailyNeedsCentsFromQuantities(hh, needsPrices!, abundance)
      : householdDailyNeedsCentsLegacy(hh);
    householdNeeds.set(hh.id, needs.requiredTotal);
    householdHousingNeeds.set(hh.id, needs.housing);
    householdFoodNeeds.set(hh.id, needs.food);
    householdElectricityNeeds.set(hh.id, needs.electricity);
    let hhPaid = 0;

    const rentParts = dwellingRentCentsPerDay(abundance);
    const landFrac =
      needs.housing > 0 && rentParts.totalCents > 0
        ? rentParts.landRentCents / rentParts.totalCents
        : 0;
    const landDue = Math.round(needs.housing * landFrac);
    const maintDue = needs.housing - landDue;

    const landPaid = payFromHousehold(ledger, hh, landDue, (agentId, max) =>
      payLandRentComponent(ledger, agentId, max),
    );
    const maintPaid = payFromHousehold(ledger, hh, maintDue, (agentId, max) =>
      routeGoodsPurchase(
        ledger,
        agentId,
        max,
        payrollByIndustry,
        industryCount,
        "housing_maintenance",
        humanShares,
        purchaseRevenue,
      ),
    );
    const housingPaid = landPaid + maintPaid;
    hhPaid += housingPaid;
    if (housingPaid < needs.housing) unmetNeedCents += needs.housing - housingPaid;

    const foodPaid = payFromHousehold(ledger, hh, needs.food, (agentId, max) =>
      routeGoodsPurchase(
        ledger,
        agentId,
        max,
        payrollByIndustry,
        industryCount,
        "food_purchase",
        humanShares,
        purchaseRevenue,
      ),
    );
    hhPaid += foodPaid;
    if (foodPaid < needs.food) unmetNeedCents += needs.food - foodPaid;

    const elecPaid = payFromHousehold(ledger, hh, needs.electricity, (agentId, max) =>
      routeGoodsPurchase(
        ledger,
        agentId,
        max,
        payrollByIndustry,
        industryCount,
        "electricity_purchase",
        humanShares,
        purchaseRevenue,
      ),
    );
    hhPaid += elecPaid;
    if (elecPaid < needs.electricity) unmetNeedCents += needs.electricity - elecPaid;

    const discretionaryTarget = consumptionState.discretionaryBudgetCents(
      hh.id,
      needs.requiredTotal,
    );
    const discretionaryPaid = payFromHousehold(
      ledger,
      hh,
      discretionaryTarget,
      (agentId, max) =>
        routeGoodsPurchase(
          ledger,
          agentId,
          max,
          payrollByIndustry,
          industryCount,
          "discretionary_goods",
          humanShares,
          purchaseRevenue,
        ),
    );
    hhPaid += discretionaryPaid;

    const avgPrice = basketPriceIndex(world, abundance, prices);
    goodsUnitsPurchased +=
      avgPrice > 0 ? (foodPaid + elecPaid + discretionaryPaid) / avgPrice : 0;

    const hasEmployed = hh.agentIds.some(
      (id) => world.agents[id].laborStatus === "employed",
    );
    if (hasEmployed && hhPaid < needs.requiredTotal) shortHouseholds += 1;
  }

  settleLandRentPolicy(ledger, world, landPolicy, policy, agentLandDividends);

  const firmPayroll = settleFirmPayroll(
    ledger,
    world,
    abundance,
    firmRevenue,
    policy,
    wagePaidByAgent,
    agentOwnershipDividends,
  );

  for (let ind = 0; ind < industryCount; ind++) {
    byIndustry[ind].wages = firmPayroll.wagesPaidByIndustry[ind];
    byIndustry[ind].output = firmPayroll.laborHoursByIndustry[ind];
  }

  let policyDistributedCents = 0;
  const producerResult = settleProducerAccount(
    ledger,
    world,
    abundance,
    policy,
    purchaseRevenue.producer,
    wagePaidByAgent,
    agentOwnershipDividends,
    settleOptions.producerOwnership,
  );
  policyDistributedCents += producerResult.producerDistributedCents;

  let producerPayrollTarget = 0;
  let producerLaborHours = 0;
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.demandSlotEmployment) {
      producerPayrollTarget += a.dailyWageCents;
      producerLaborHours += laborHoursFromPaid(
        a.dailyWageCents,
        wagePaidByAgent.get(a.id) ?? 0,
      );
    }
  }

  const payrollCents = firmPayroll.payrollTargetCents + producerPayrollTarget;
  const wagesPaidCents =
    firmPayroll.wagesPaidCents + producerResult.producerWagesPaidCents;
  const wageGapCents = payrollCents - wagesPaidCents;
  const totalLaborHours = firmPayroll.totalLaborHours + producerLaborHours;

  for (const a of world.agents) {
    const paid = wagePaidByAgent.get(a.id) ?? 0;
    const target =
      a.laborStatus === "employed"
        ? a.dailyWageCents
        : 0;
    if (paid < target) unmetNeedCents += target - paid;
    const tax = Math.floor(paid * m2aEconomy.payrollTaxRate);
    if (tax > 0) {
      ledger.transferUpTo(agentAccount(a.id), TREASURY_ACCOUNT, tax, "payroll_tax");
    }
  }

  const ownershipDistributedCents = firmPayroll.ownershipDistributedCents;

  const landlordResidual = ledger.getBalance(LANDLORD_ACCOUNT);
  if (landlordResidual > 0) {
    ledger.transfer(
      LANDLORD_ACCOUNT,
      TREASURY_ACCOUNT,
      landlordResidual,
      "landlord_operating_surplus_sweep",
    );
  }

  const ssPaidByAgent = new Map<number, number>();
  const uiPaidByAgent = new Map<number, number>();
  const ssDaily = m2aEconomy.socialSecurityDailyCentsPerNlfAgent;
  for (const a of world.agents) {
    if (useQuantityNeeds) {
      if (a.laborStatus !== "not_in_labor_force" && a.laborStatus !== "retired") continue;
    } else if (a.laborStatus !== "not_in_labor_force") {
      continue;
    }
    const paid = ledger.transferUpTo(
      TREASURY_ACCOUNT,
      agentAccount(a.id),
      ssDaily,
      "social_security",
    );
    ssPaidByAgent.set(a.id, paid);
  }

  const uiDaily = m2aEconomy.unemploymentDailyCentsPerAgent;
  for (const a of world.agents) {
    if (useQuantityNeeds) {
      if (a.laborStatus !== "unemployed" && a.laborStatus !== "retraining") continue;
    } else if (a.laborStatus !== "unemployed") {
      continue;
    }
    const paid = ledger.transferUpTo(
      TREASURY_ACCOUNT,
      agentAccount(a.id),
      uiDaily,
      "unemployment_insurance",
    );
    uiPaidByAgent.set(a.id, paid);
  }

  const treasuryPool = ledger.getBalance(TREASURY_ACCOUNT);
  if (treasuryPool > 0) {
    const moved = distributePoolByPolicy(
      ledger,
      TREASURY_ACCOUNT,
      treasuryPool,
      policy,
      world.households,
      world.capitalShare,
      world.agents.length,
      "policy_transfer",
      agentPolicyDividends,
    );
    policyDistributedCents += moved;
  }

  for (const hh of world.households) {
    let wageInflow = 0;
    let wageOwnershipInflow = 0;
    let disposableInflow = 0;
    let policyInflow = 0;
    let transferInflow = 0;
    let nonWage = 0;
    for (const agentId of hh.agentIds) {
      const wage = wagePaidByAgent.get(agentId) ?? 0;
      const ss = ssPaidByAgent.get(agentId) ?? 0;
      const ui = uiPaidByAgent.get(agentId) ?? 0;
      const ownership = agentOwnershipDividends.get(agentId) ?? 0;
      const policy = agentPolicyDividends.get(agentId) ?? 0;
      const land = agentLandDividends.get(agentId) ?? 0;
      wageInflow += wage;
      wageOwnershipInflow += wage + ownership;
      disposableInflow += wage + ss + ui + ownership + policy + land;
      policyInflow += policy + land;
      transferInflow += ss + ui + policy + land;
      nonWage += ss + ui + ownership + policy + land;
    }
    householdWageInflow.set(hh.id, wageInflow);
    householdWageOwnershipInflow.set(hh.id, wageOwnershipInflow);
    householdDisposableInflow.set(hh.id, disposableInflow);
    householdPolicyInflow.set(hh.id, policyInflow);
    householdTransferInflow.set(hh.id, transferInflow);
    householdNonWageIncome.set(hh.id, nonWage);
    consumptionState.recordDay(
      hh.id,
      disposableInflow - policyInflow,
    );
  }

  return {
    day: dayIndex,
    tick,
    pricesCents: prices,
    priceIndex: basketPriceIndex(world, abundance, prices),
    employed: countEmployed(world.agents),
    displaced,
    unmetNeedCents,
    shortHouseholds,
    totalLaborHours,
    goodsUnitsPurchased,
    byIndustry,
    householdNonWageIncomeCents: householdNonWageIncome,
    householdNeedsCents: householdNeeds,
    householdWageInflowCents: householdWageInflow,
    householdWageOwnershipInflowCents: householdWageOwnershipInflow,
    householdDisposableInflowCents: householdDisposableInflow,
    householdPolicyInflowCents: householdPolicyInflow,
    householdTransferInflowCents: householdTransferInflow,
    householdHousingNeedsCents: householdHousingNeeds,
    householdFoodNeedsCents: householdFoodNeeds,
    householdElectricityNeedsCents: householdElectricityNeeds,
    wagePaidByAgent,
    wageSubsidyCents,
    payrollCents,
    wagesPaidCents,
    wageGapCents,
    producerInflowCents: purchaseRevenue.producer,
    ownershipDistributedCents,
    policyDistributedCents,
    queued: world.m2b?.queue.length ?? 0,
    retired: world.agents.filter((a) => a.laborStatus === "retired").length,
    queueHiresCumulative: world.m2b?.queueHiresCumulative ?? 0,
    medianReemploymentDelayDays: medianReemploymentDelayDays(world),
    queueHiresToday: world.m2b?.hiresToday ?? 0,
    separationsToday: world.m2b?.separationsToday ?? 0,
    laborPartition: world.m2b ? laborPartitionCounts(world) : null,
    firmBalancesCents: Array.from({ length: industryCount }, (_, ind) =>
      ledger.getBalance(firmAccount(ind)),
    ),
    agentCashCentsTotal: world.agents.reduce(
      (s, a) => s + ledger.getBalance(agentAccount(a.id)),
      0,
    ),
    firmRevenueCentsTotal: firmRevenue.reduce((s, n) => s + n, 0),
    humanVariantSpendByIndustry: purchaseRevenue.humanVariantSpendByIndustry,
    goodsSpendByIndustry: purchaseRevenue.goodsSpendByIndustry,
  };
}
