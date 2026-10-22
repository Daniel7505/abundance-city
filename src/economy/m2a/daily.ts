import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { automatedLaborShare } from "./dial.js";
import { distributePoolByPolicy } from "./distribute.js";
import { basketPriceIndex, industryPricesCents } from "./prices.js";
import type { DividendPolicy } from "./policy.js";
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
import { medianReemploymentDelayDays } from "../m2b/labor.js";

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
  householdCashInflowCents: Map<number, number>;
  wagePaidByAgent: Map<number, number>;
  wageSubsidyCents: number;
  payrollCents: number;
  ownershipDistributedCents: number;
  policyDistributedCents: number;
  queued: number;
  retired: number;
  queueHiresCumulative: number;
  medianReemploymentDelayDays: number;
}

export interface SettleM2aDayOptions {
  useQuantityNeeds?: boolean;
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
}

function routePurchase(
  ledger: Ledger,
  agentId: number,
  amount: number,
  jobsByIndustry: number[],
  industryCount: number,
  autoShare: number,
  reason: string,
  revenue?: PurchaseRevenue,
): number {
  const totalJobs = jobsByIndustry.reduce((s, n) => s + n, 0) || 1;
  let remaining = amount;
  let paid = 0;
  const toAuto = Math.round(amount * autoShare);
  const toHuman = amount - toAuto;
  if (toAuto > 0) {
    const slice = ledger.transferUpTo(
      agentAccount(agentId),
      PRODUCER_ACCOUNT,
      Math.min(toAuto, remaining),
      `${reason}_auto`,
    );
    if (revenue) revenue.producer += slice;
    paid += slice;
    remaining -= slice;
  }
  let humanLeft = toHuman;
  for (let ind = 0; ind < industryCount && humanLeft > 0; ind++) {
    const share = Math.ceil((humanLeft * jobsByIndustry[ind]) / totalJobs);
    const slice = ledger.transferUpTo(agentAccount(agentId), firmAccount(ind), share, reason);
    if (revenue) revenue.firm[ind] += slice;
    paid += slice;
    humanLeft -= slice;
    remaining -= slice;
  }
  return paid;
}

export function settleM2aDay(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  policy: DividendPolicy,
  dayIndex: number,
  tick: number,
  displaced: number,
  settleOptions: SettleM2aDayOptions = {},
): DailySettlementResult {
  const useQuantityNeeds = settleOptions.useQuantityNeeds ?? false;
  const industryCount = world.industrySlotsBase.length;
  const prices = industryPricesCents(world, abundance);
  const autoShare = automatedLaborShare(abundance);
  const jobsByIndustry = Array.from({ length: industryCount }, () => 0);
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      jobsByIndustry[a.industryIndex] += 1;
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
  const householdCashInflow = new Map<number, number>();
  const wagePaidByAgent = new Map<number, number>();
  const agentDividends = new Map<number, number>();
  const wageSubsidyCents = 0;
  let payrollCents = 0;
  const firmRevenue = Array.from({ length: industryCount }, () => 0);
  const purchaseRevenue: PurchaseRevenue = { firm: firmRevenue, producer: 0 };
  let landlordRevenue = 0;

  const needsPrices = useQuantityNeeds ? needsPriceContext(world, abundance) : null;

  for (const hh of world.households) {
    const needs = useQuantityNeeds
      ? householdDailyNeedsCentsFromQuantities(hh, needsPrices!)
      : householdDailyNeedsCentsLegacy(hh);
    householdNeeds.set(hh.id, needs.requiredTotal);
    let hhPaid = 0;

    const housingPaid = payFromHousehold(ledger, hh, needs.housing, (agentId, max) => {
      const paid = ledger.transferUpTo(agentAccount(agentId), LANDLORD_ACCOUNT, max, "housing");
      landlordRevenue += paid;
      return paid;
    });
    hhPaid += housingPaid;
    if (housingPaid < needs.housing) unmetNeedCents += needs.housing - housingPaid;

    const foodPaid = payFromHousehold(ledger, hh, needs.food, (agentId, max) =>
      routePurchase(
        ledger,
        agentId,
        max,
        jobsByIndustry,
        industryCount,
        autoShare,
        "food_purchase",
        purchaseRevenue,
      ),
    );
    hhPaid += foodPaid;
    if (foodPaid < needs.food) unmetNeedCents += needs.food - foodPaid;

    const elecPaid = payFromHousehold(ledger, hh, needs.electricity, (agentId, max) =>
      routePurchase(
        ledger,
        agentId,
        max,
        jobsByIndustry,
        industryCount,
        autoShare,
        "electricity_purchase",
        purchaseRevenue,
      ),
    );
    hhPaid += elecPaid;
    if (elecPaid < needs.electricity) unmetNeedCents += needs.electricity - elecPaid;

    const avgPrice = basketPriceIndex(world, abundance, prices);
    goodsUnitsPurchased += avgPrice > 0 ? (foodPaid + elecPaid) / avgPrice : 0;

    const hasEmployed = hh.agentIds.some(
      (id) => world.agents[id].laborStatus === "employed",
    );
    if (hasEmployed && hhPaid < needs.requiredTotal) shortHouseholds += 1;
  }

  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      const firm = firmAccount(a.industryIndex);
      const target = a.dailyWageCents;
      payrollCents += target;
      const paid = ledger.transferUpTo(firm, agentAccount(a.id), target, "wage");
      if (paid < target) unmetNeedCents += target - paid;
      byIndustry[a.industryIndex].wages += paid;
      wagePaidByAgent.set(a.id, paid);
      const tax = Math.floor(paid * m2aEconomy.payrollTaxRate);
      if (tax > 0) {
        ledger.transferUpTo(agentAccount(a.id), TREASURY_ACCOUNT, tax, "payroll_tax");
      }
    }
  }

  const ssPaidByAgent = new Map<number, number>();
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
    ssPaidByAgent.set(a.id, (ssPaidByAgent.get(a.id) ?? 0) + paid);
  }

  let ownershipDistributedCents = 0;
  let policyDistributedCents = 0;

  const ownershipPolicy: DividendPolicy =
    policy.kind === "TaxAndDividend" ? policy : { kind: "CapitalShare" };

  const markup = m2aEconomy.firmMarkup;
  const profitFromRevenue = (revenue: number, balance: number): number => {
    if (revenue <= 0 || markup <= 0) return 0;
    return Math.min(balance, Math.floor(revenue * markup));
  };

  for (let ind = 0; ind < industryCount; ind++) {
    const from = firmAccount(ind);
    const profit = profitFromRevenue(firmRevenue[ind], ledger.getBalance(from));
    if (profit <= 0) continue;
    const moved = distributePoolByPolicy(
      ledger,
      from,
      profit,
      ownershipPolicy,
      world.households,
      world.capitalShare,
      world.agents.length,
      "ownership_income",
      agentDividends,
    );
    ownershipDistributedCents += moved;
  }

  const landlordProfit = profitFromRevenue(landlordRevenue, ledger.getBalance(LANDLORD_ACCOUNT));
  if (landlordProfit > 0) {
    const moved = distributePoolByPolicy(
      ledger,
      LANDLORD_ACCOUNT,
      landlordProfit,
      ownershipPolicy,
      world.households,
      world.capitalShare,
      world.agents.length,
      "ownership_income",
      agentDividends,
    );
    ownershipDistributedCents += moved;
  }

  const producerProfit = profitFromRevenue(
    purchaseRevenue.producer,
    ledger.getBalance(PRODUCER_ACCOUNT),
  );
  if (producerProfit > 0) {
    const moved = distributePoolByPolicy(
      ledger,
      PRODUCER_ACCOUNT,
      producerProfit,
      policy,
      world.households,
      world.capitalShare,
      world.agents.length,
      "automated_producer_dividend",
      agentDividends,
    );
    policyDistributedCents += moved;
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
      agentDividends,
    );
    policyDistributedCents += moved;
  }

  for (const hh of world.households) {
    let inflow = 0;
    let nonWage = 0;
    for (const agentId of hh.agentIds) {
      const wage = wagePaidByAgent.get(agentId) ?? 0;
      const ss = ssPaidByAgent.get(agentId) ?? 0;
      const div = agentDividends.get(agentId) ?? 0;
      inflow += wage + ss + div;
      nonWage += ss + div;
    }
    householdCashInflow.set(hh.id, inflow);
    householdNonWageIncome.set(hh.id, nonWage);
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
    totalLaborHours: countEmployed(world.agents),
    goodsUnitsPurchased,
    byIndustry,
    householdNonWageIncomeCents: householdNonWageIncome,
    householdNeedsCents: householdNeeds,
    householdCashInflowCents: householdCashInflow,
    wagePaidByAgent,
    wageSubsidyCents,
    payrollCents,
    ownershipDistributedCents,
    policyDistributedCents,
    queued: world.m2b?.queue.length ?? 0,
    retired: world.agents.filter((a) => a.laborStatus === "retired").length,
    queueHiresCumulative: world.m2b?.queueHiresCumulative ?? 0,
    medianReemploymentDelayDays: medianReemploymentDelayDays(world),
  };
}
