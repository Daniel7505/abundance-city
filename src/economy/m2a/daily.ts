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
} from "./accounts.js";
import { goodsPriceCents, outputShares } from "./dial.js";
import { countEmployed, industryEmploymentCounts } from "./jobs.js";
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
  const byIndustry: IndustryDayStats[] = Array.from({ length: industryCount }, () => ({
    jobs: 0,
    wages: 0,
    output: 0,
  }));

  let unmetNeedCents = 0;
  let shortHouseholds = 0;
  let goodsUnitsPurchased = 0;
  const householdNonWageIncome = new Map<number, number>();
  const householdNeeds = new Map<number, number>();
  const agentIncome = new Map<number, number>();

  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      const firm = firmAccount(a.industryIndex);
      const wage = Math.min(a.dailyWageCents, ledger.getBalance(firm));
      if (wage < a.dailyWageCents) {
        unmetNeedCents += a.dailyWageCents - wage;
      }
      if (wage > 0) {
        ledger.transfer(firm, agentAccount(a.id), wage, "wage");
        byIndustry[a.industryIndex].wages += wage;
        byIndustry[a.industryIndex].jobs += 1;
      }
    }
  }

  for (const hh of world.households) {
    const needs = householdDailyNeedsCents(hh);
    const goodsNeedCents = price * hh.size;
    householdNeeds.set(hh.id, needs.requiredTotal + goodsNeedCents);
    let hhPaid = 0;
    for (const agentId of hh.agentIds) {
      const share = agentShareOfNeed(needs.housing, hh.size);
      const paid = ledger.transferUpTo(
        agentAccount(agentId),
        LANDLORD_ACCOUNT,
        share,
        "housing",
      );
      hhPaid += paid;
      if (paid < share) unmetNeedCents += share - paid;
    }
    for (const agentId of hh.agentIds) {
      const share = agentShareOfNeed(needs.food, hh.size);
      const paid = ledger.transferUpTo(
        agentAccount(agentId),
        TREASURY_ACCOUNT,
        share,
        "food",
      );
      hhPaid += paid;
      if (paid < share) unmetNeedCents += share - paid;
    }
    for (const agentId of hh.agentIds) {
      const share = agentShareOfNeed(needs.electricity, hh.size);
      const paid = ledger.transferUpTo(
        agentAccount(agentId),
        TREASURY_ACCOUNT,
        share,
        "electricity",
      );
      hhPaid += paid;
      if (paid < share) unmetNeedCents += share - paid;
    }
    if (hhPaid < needs.requiredTotal * hh.agentIds.length / hh.size) {
      shortHouseholds += 1;
    }

    const disc = discretionaryBudgetCents(hh);
    for (const agentId of hh.agentIds) {
      const target = Math.ceil(disc / hh.size);
      const paid = ledger.transferUpTo(
        agentAccount(agentId),
        TREASURY_ACCOUNT,
        target,
        "discretionary_staging",
      );
      if (paid < target) unmetNeedCents += target - paid;
      if (paid <= 0) continue;
      const units = price > 0 ? paid / price : 0;
      goodsUnitsPurchased += units;
      const toHuman = Math.round(paid * humanShare);
      const toAuto = paid - toHuman;
      if (toHuman > 0) {
        const per = Math.floor(toHuman / industryCount);
        let rem = toHuman - per * industryCount;
        for (let ind = 0; ind < industryCount; ind++) {
          let share = per + (rem > 0 ? 1 : 0);
          if (rem > 0) rem -= 1;
          if (share > 0) {
            ledger.transfer(TREASURY_ACCOUNT, firmAccount(ind), share, "goods_revenue");
            byIndustry[ind].output += share;
          }
        }
      }
      if (toAuto > 0) {
        ledger.transfer(TREASURY_ACCOUNT, PRODUCER_ACCOUNT, toAuto, "goods_auto");
      }
    }
  }

  for (let ind = 0; ind < industryCount; ind++) {
    const bal = ledger.getBalance(firmAccount(ind));
    if (bal > 0) {
      ledger.transfer(firmAccount(ind), TREASURY_ACCOUNT, bal, "firm_profit");
    }
  }

  const landlordBal = ledger.getBalance(LANDLORD_ACCOUNT);
  if (landlordBal > 0) {
    ledger.transfer(LANDLORD_ACCOUNT, TREASURY_ACCOUNT, landlordBal, "rent_to_treasury");
  }

  const producerBal = ledger.getBalance(PRODUCER_ACCOUNT);
  if (producerBal > 0) {
    ledger.transfer(PRODUCER_ACCOUNT, TREASURY_ACCOUNT, producerBal, "producer_profit");
  }

  const treasuryBal = ledger.getBalance(TREASURY_ACCOUNT);
  const dividendPer = Math.floor(treasuryBal / world.agents.length);
  if (dividendPer > 0) {
    for (const a of world.agents) {
      ledger.transfer(TREASURY_ACCOUNT, agentAccount(a.id), dividendPer, "dividend");
    }
  }

  for (const a of world.agents) {
    const income = dividendPer;
    agentIncome.set(a.id, income);
    const hhId = a.householdId;
    householdNonWageIncome.set(hhId, (householdNonWageIncome.get(hhId) ?? 0) + income);
  }

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
  };
}
