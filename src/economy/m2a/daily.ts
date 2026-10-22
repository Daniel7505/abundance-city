import coefficients from "../../../data/coefficients.json" with { type: "json" };
import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { getTown } from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";
import {
  LANDLORD_ACCOUNT,
  PRODUCER_ACCOUNT,
  TREASURY_ACCOUNT,
  agentAccount,
  firmAccount,
  type AccountId,
} from "./accounts.js";
import { goodsPriceCents, outputShares } from "./dial.js";
import { countEmployed } from "./jobs.js";
import type { Ledger } from "../ledger.js";
import type { AgentState, Household, M2aWorld } from "../../sim/m2a/types.js";
import { agentShareOfNeed, householdDailyNeedsCents } from "../../sim/m2a/needs.js";

export interface IndustryDayStats {
  jobs: number;
  wages: number;
  output: number;
}

export interface DailySettlementResult {
  day: number;
  tick: number;
  priceCents: number;
  employed: number;
  unmetNeedCents: number;
  shortHouseholds: number;
  goodsUnitsPurchased: number;
  humanEnergyWh: number;
  automatedEnergyWh: number;
  totalEnergyWh: number;
  costPerPersonCents: number;
  dividendPerAgentCents: number;
  byIndustry: IndustryDayStats[];
  householdNonWageIncomeCents: Map<number, number>;
  householdNeedsCents: Map<number, number>;
  agentIncomeCents: Map<number, number>;
  wagePaidByAgent: Map<number, number>;
}

function discretionaryBudgetCents(hh: Household): number {
  const town = getTown();
  const incomeCents = hh.incomeAnnualUsd * 100;
  const otherShare =
    1 -
    readNumber(town.ce_housing_share) -
    readNumber(town.ce_food_share) -
    readNumber(town.ce_health_share);
  const transport = readNumber(town.ce_transport_share);
  const discretionaryShare = Math.max(0, otherShare - transport);
  return Math.floor((discretionaryShare * incomeCents) / 365);
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

function payAgentToFirms(
  ledger: Ledger,
  agentId: number,
  targetCents: number,
  jobsByIndustry: number[],
  reason: string,
  byIndustry: IndustryDayStats[],
): number {
  const from = agentAccount(agentId);
  const budget = Math.min(targetCents, ledger.getBalance(from));
  if (budget <= 0) return 0;
  const totalJobs = jobsByIndustry.reduce((s, n) => s + n, 0) || 1;
  let remainder = budget;
  for (let ind = 0; ind < jobsByIndustry.length; ind++) {
    const share = Math.floor((budget * jobsByIndustry[ind]) / totalJobs);
    if (share > 0) {
      ledger.transfer(from, firmAccount(ind), share, reason);
      byIndustry[ind].output += share;
      remainder -= share;
    }
  }
  if (remainder > 0) {
    ledger.transfer(from, firmAccount(0), remainder, reason);
    byIndustry[0].output += remainder;
  }
  return budget;
}

export function settleM2aDay(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  dayIndex: number,
  tick: number,
): DailySettlementResult {
  const price = goodsPriceCents(abundance);
  const { human: humanShare, automated: autoShare } = outputShares(abundance);
  const industryCount = world.industrySlotsBase.length;
  const jobsByIndustry = Array.from({ length: industryCount }, () => 0);
  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      jobsByIndustry[a.industryIndex] += 1;
    }
  }

  const byIndustry: IndustryDayStats[] = jobsByIndustry.map((jobs) => ({
    jobs,
    wages: 0,
    output: 0,
  }));

  let unmetNeedCents = 0;
  let shortHouseholds = 0;
  const povertyThresholdUsd = 20_000;
  let goodsUnitsPurchased = 0;
  const householdNonWageIncome = new Map<number, number>();
  const householdNeeds = new Map<number, number>();
  const agentIncome = new Map<number, number>();
  const wagePaidByAgent = new Map<number, number>();

  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      const firm = firmAccount(a.industryIndex);
      const target = a.dailyWageCents;
      let paid = ledger.transferUpTo(firm, agentAccount(a.id), target, "wage");
      if (paid < target) {
        paid += ledger.transferUpTo(
          TREASURY_ACCOUNT,
          agentAccount(a.id),
          target - paid,
          "wage_subsidy",
        );
      }
      const hh = world.households[a.householdId];
      if (paid < target && hh.incomeAnnualUsd <= povertyThresholdUsd) {
        unmetNeedCents += target - paid;
      }
      byIndustry[a.industryIndex].wages += paid;
      wagePaidByAgent.set(a.id, paid);
    }
  }

  for (const hh of world.households) {
    const needs = householdDailyNeedsCents(hh);
    const goodsNeedCents = price * hh.size;
    householdNeeds.set(hh.id, needs.requiredTotal + goodsNeedCents);
    let hhRequiredPaid = 0;

    const housingPaid = payFromHousehold(ledger, hh, needs.housing, (agentId, max) =>
      ledger.transferUpTo(agentAccount(agentId), LANDLORD_ACCOUNT, max, "housing"),
    );
    hhRequiredPaid += housingPaid;
    if (housingPaid < needs.housing && hh.incomeAnnualUsd <= povertyThresholdUsd) {
      unmetNeedCents += needs.housing - housingPaid;
    }

    const foodPaid = payFromHousehold(ledger, hh, needs.food, (agentId, max) =>
      payAgentToFirms(ledger, agentId, max, jobsByIndustry, "food_revenue", byIndustry),
    );
    hhRequiredPaid += foodPaid;
    if (foodPaid < needs.food && hh.incomeAnnualUsd <= povertyThresholdUsd) {
      unmetNeedCents += needs.food - foodPaid;
    }

    const elecPaid = payFromHousehold(ledger, hh, needs.electricity, (agentId, max) =>
      payAgentToFirms(ledger, agentId, max, jobsByIndustry, "electricity_revenue", byIndustry),
    );
    hhRequiredPaid += elecPaid;
    if (elecPaid < needs.electricity && hh.incomeAnnualUsd <= povertyThresholdUsd) {
      unmetNeedCents += needs.electricity - elecPaid;
    }

    const disc = discretionaryBudgetCents(hh);
    const discPaid = payFromHousehold(ledger, hh, disc, (agentId, max) => {
      const from = agentAccount(agentId);
      const budget = Math.min(max, ledger.getBalance(from));
      if (budget <= 0) return 0;
      const toHuman = Math.round(budget * humanShare);
      const toAuto = budget - toHuman;
      if (toHuman > 0) {
        payAgentToFirms(ledger, agentId, toHuman, jobsByIndustry, "goods_revenue", byIndustry);
      }
      if (toAuto > 0) {
        ledger.transferUpTo(from, PRODUCER_ACCOUNT, toAuto, "goods_auto");
      }
      const units = price > 0 ? budget / price : 0;
      goodsUnitsPurchased += units;
      return budget;
    });

    const hasEmployed = hh.agentIds.some(
      (id) => world.agents[id].laborStatus === "employed",
    );
    if (
      hh.incomeAnnualUsd <= povertyThresholdUsd &&
      hasEmployed &&
      hhRequiredPaid < needs.requiredTotal
    ) {
      shortHouseholds += 1;
    }
  }

  for (let ind = 0; ind < industryCount; ind++) {
    const workers = jobsByIndustry[ind];
    const avgWage =
      workers > 0
        ? world.agents
            .filter((a) => a.laborStatus === "employed" && a.industryIndex === ind)
            .reduce((s, a) => s + a.dailyWageCents, 0) / workers
        : 0;
    const reserve = Math.ceil(avgWage * workers * m2aEconomy.firmPayrollReserveDays);
    const bal = ledger.getBalance(firmAccount(ind));
    const sweep = Math.max(0, bal - reserve);
    if (sweep > 0) {
      ledger.transfer(firmAccount(ind), TREASURY_ACCOUNT, sweep, "firm_profit");
    }
  }

  const landlordBal = ledger.getBalance(LANDLORD_ACCOUNT);
  const landlordTax = Math.floor(landlordBal * m2aEconomy.treasuryLandlordTaxShare);
  if (landlordTax > 0) {
    ledger.transfer(LANDLORD_ACCOUNT, TREASURY_ACCOUNT, landlordTax, "landlord_tax");
  }

  const ssDaily = m2aEconomy.socialSecurityDailyCentsPerNlfAgent;
  for (const a of world.agents) {
    if (a.laborStatus === "not_in_labor_force") {
      const paid = ledger.transferUpTo(
        TREASURY_ACCOUNT,
        agentAccount(a.id),
        ssDaily,
        "social_security",
      );
      agentIncome.set(a.id, (agentIncome.get(a.id) ?? 0) + paid);
      const hhId = a.householdId;
      householdNonWageIncome.set(hhId, (householdNonWageIncome.get(hhId) ?? 0) + paid);
    }
  }

  const producerBal = ledger.getBalance(PRODUCER_ACCOUNT);
  const treasuryForAbundance = Math.floor(
    ledger.getBalance(TREASURY_ACCOUNT) *
      m2aEconomy.abundanceDividendTreasuryShare *
      abundance,
  );
  const maxAbundanceFunds = producerBal + treasuryForAbundance;
  const abundancePool = Math.min(
    maxAbundanceFunds,
    Math.floor(
      maxAbundanceFunds * abundance * m2aEconomy.abundanceDividendMultiplier,
    ),
  );
  if (abundancePool > 0) {
    const agentWeights = world.agents.map((a) => {
      const hh = world.households[a.householdId];
      return hh.incomeAnnualUsd / hh.size;
    });
    const totalWeight = agentWeights.reduce((s, w) => s + w, 0);
    let distributed = 0;
    for (let i = 0; i < world.agents.length; i++) {
      const a = world.agents[i];
      const target =
        i === world.agents.length - 1
          ? abundancePool - distributed
          : Math.floor((abundancePool * agentWeights[i]) / totalWeight);
      let paid = ledger.transferUpTo(
        PRODUCER_ACCOUNT,
        agentAccount(a.id),
        target,
        "abundance_dividend",
      );
      if (paid < target) {
        paid += ledger.transferUpTo(
          TREASURY_ACCOUNT,
          agentAccount(a.id),
          target - paid,
          "abundance_dividend_treasury",
        );
      }
      distributed += paid;
      if (paid > 0) {
        agentIncome.set(a.id, (agentIncome.get(a.id) ?? 0) + paid);
        householdNonWageIncome.set(
          a.householdId,
          (householdNonWageIncome.get(a.householdId) ?? 0) + paid,
        );
      }
    }
  }

  const dividendPer = 0;

  const humanEnergyWh =
    goodsUnitsPurchased * humanShare * coefficients.energyWhPerGoodsUnit.human;
  const automatedEnergyWh =
    goodsUnitsPurchased * autoShare * coefficients.energyWhPerGoodsUnit.automated;

  const avgNeeds =
    world.households.reduce(
      (s, hh) => s + householdDailyNeedsCents(hh).requiredTotal,
      0,
    ) / world.households.length;

  return {
    day: dayIndex,
    tick,
    priceCents: price,
    employed: countEmployed(world.agents),
    unmetNeedCents,
    shortHouseholds,
    goodsUnitsPurchased,
    humanEnergyWh,
    automatedEnergyWh,
    totalEnergyWh: humanEnergyWh + automatedEnergyWh,
    costPerPersonCents: Math.round(avgNeeds),
    dividendPerAgentCents: dividendPer,
    byIndustry,
    householdNonWageIncomeCents: householdNonWageIncome,
    householdNeedsCents: householdNeeds,
    agentIncomeCents: agentIncome,
    wagePaidByAgent,
  };
}
