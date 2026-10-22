import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import {
  getTown,
  industryAgentSlots,
  scaledAgentCount,
  scaledHouseholdCount,
  scaledLaborForceCount,
  scaledOwnerHouseholds,
  scaledRenterHouseholds,
  scaledUnemployedCount,
} from "../../town/lindsborg.js";
import { readNumber } from "../../town/sourced.js";
import { SeededPrng } from "../prng.js";
import { assignHouseholdCapitalShares } from "../../economy/m2a/ownership.js";
import { assignDailyWagesFromConsumption } from "../../economy/m2a/wages.js";
import { basketPriceIndex, industryPricesCents } from "../../economy/m2a/prices.js";
import { needsPriceContext } from "./needs-prices.js";
import { deriveHouseholdNeedsQuantities } from "./needs-quantities.js";
import { calibrateHouseholdHousingBurden } from "./housing-calibration.js";
import type { AgentState, BaselineEmploymentSlot, Household, M2aWorld } from "./types.js";

function sampleHouseholdSizes(prng: SeededPrng, households: number, targetAgents: number): number[] {
  const sizes: number[] = [];
  let remaining = targetAgents;
  for (let h = 0; h < households; h++) {
    const left = households - h;
    const min = Math.max(1, remaining - 4 * (left - 1));
    const max = Math.min(4, remaining - (left - 1));
    const size = h === households - 1 ? remaining : prng.nextInt(min, max);
    sizes.push(size);
    remaining -= size;
  }
  return sizes;
}

function sampleIncomeUsd(prng: SeededPrng, bandIndex: number): number {
  const town = getTown();
  const band = town.income_bands_b19001[bandIndex];
  const min = readNumber(band.min_usd);
  const max = readNumber(band.max_usd);
  if (band.label === "200k_plus") {
    const alpha = m2aEconomy.paretoAlphaAbove200k;
    const u = prng.next();
    const pareto = min / Math.pow(u, 1 / alpha);
    return Math.min(max, Math.round(pareto));
  }
  return prng.nextInt(min, max);
}

function pickIncomeBand(prng: SeededPrng, weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = prng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function buildM2aWorld(seed: number): M2aWorld {
  const prng = new SeededPrng(seed);
  const town = getTown();
  const householdCount = scaledHouseholdCount();
  const agentCount = scaledAgentCount();
  const sizes = sampleHouseholdSizes(prng, householdCount, agentCount);

  const bandWeights = town.income_bands_b19001.map((b) => readNumber(b.household_count));
  const households: Household[] = [];
  let agentId = 0;
  for (let h = 0; h < householdCount; h++) {
    const bandIdx = pickIncomeBand(prng, bandWeights);
    const incomeAnnualUsd = sampleIncomeUsd(prng, bandIdx);
    const agentIds: number[] = [];
    for (let s = 0; s < sizes[h]; s++) {
      agentIds.push(agentId++);
    }
    households.push({
      id: h,
      size: sizes[h],
      incomeAnnualUsd,
      isRenter: false,
      agentIds,
      housingBurdenMultiplier: 1,
      needsQuantity: {
        housingServiceUnits: 0,
        foodGoodsUnits: 0,
        electricityKwh: 0,
      },
    });
  }

  const renterTarget = scaledRenterHouseholds();
  const ownerTarget = scaledOwnerHouseholds();
  const sortedByIncome = [...households].sort((a, b) => a.incomeAnnualUsd - b.incomeAnnualUsd);
  for (let i = 0; i < renterTarget; i++) {
    sortedByIncome[i].isRenter = true;
  }
  for (let i = renterTarget; i < renterTarget + ownerTarget && i < sortedByIncome.length; i++) {
    sortedByIncome[i].isRenter = false;
  }

  const agePrng = new SeededPrng(seed + 12_345);
  const agents: AgentState[] = [];
  for (const hh of households) {
    for (const id of hh.agentIds) {
      agents.push({
        id,
        householdId: hh.id,
        laborStatus: "not_in_labor_force",
        industryIndex: null,
        demandSlotEmployment: false,
        skill: prng.next(),
        dailyWageCents: 0,
        ageYears: agePrng.nextInt(22, 72),
      });
    }
  }

  const laborForceTarget = scaledLaborForceCount();
  const laborForceIds: number[] = [];
  const byHousehold = households.map((hh) => [...hh.agentIds].sort((a, b) => a - b));
  let lfCursor = 0;
  while (laborForceIds.length < laborForceTarget) {
    let added = false;
    for (const memberIds of byHousehold) {
      if (lfCursor >= memberIds.length) continue;
      laborForceIds.push(memberIds[lfCursor]);
      added = true;
      if (laborForceIds.length >= laborForceTarget) break;
    }
    if (!added) break;
    lfCursor += 1;
  }
  if (laborForceIds.length < laborForceTarget) {
    for (const a of agents) {
      if (laborForceIds.includes(a.id)) continue;
      laborForceIds.push(a.id);
      if (laborForceIds.length >= laborForceTarget) break;
    }
  }

  const unemployedCount = scaledUnemployedCount();
  const lfByIncomeAsc = [...laborForceIds].sort((a, b) => {
    const ha = households[agents[a].householdId].incomeAnnualUsd;
    const hb = households[agents[b].householdId].incomeAnnualUsd;
    return ha - hb || agents[a].skill - agents[b].skill || a - b;
  });
  const unemployedIds = new Set(lfByIncomeAsc.slice(0, unemployedCount));
  const employedSlots = industryAgentSlots();
  const employedPool = laborForceIds.filter((id) => !unemployedIds.has(id));

  let poolIdx = 0;
  for (let ind = 0; ind < employedSlots.length; ind++) {
    for (let s = 0; s < employedSlots[ind]; s++) {
      const agent = agents[employedPool[poolIdx++]];
      agent.laborStatus = "employed";
      agent.industryIndex = ind;
    }
  }
  for (const id of unemployedIds) {
    agents[id].laborStatus = "unemployed";
  }

  const baselineEmployment: BaselineEmploymentSlot[] = [];
  const baselineUnemployed: number[] = [];
  const baselineNotInLaborForce: number[] = [];
  for (const a of agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      baselineEmployment.push({ agentId: a.id, industryIndex: a.industryIndex });
    } else if (a.laborStatus === "unemployed") {
      baselineUnemployed.push(a.id);
    } else {
      baselineNotInLaborForce.push(a.id);
    }
  }

  const capitalShare = assignHouseholdCapitalShares(seed, households);

  const worldDraft: M2aWorld = {
    agents,
    households,
    industrySlotsBase: employedSlots,
    baselineEmployment,
    baselineUnemployed,
    baselineNotInLaborForce,
    capitalShare,
    referenceGoodsCentsPerUnit: 1,
    referenceBasketPriceIndex: 1,
    m2b: null,
  };
  const refPrices = needsPriceContext(worldDraft, 0);
  worldDraft.referenceGoodsCentsPerUnit = refPrices.goodsCentsPerUnit;
  for (const hh of households) {
    hh.needsQuantity = deriveHouseholdNeedsQuantities(hh, refPrices);
  }
  calibrateHouseholdHousingBurden(worldDraft, refPrices);

  assignDailyWagesFromConsumption(worldDraft);
  const abundanceZeroPrices = industryPricesCents(worldDraft, 0);
  worldDraft.referenceBasketPriceIndex = basketPriceIndex(worldDraft, 0, abundanceZeroPrices);
  worldDraft.referenceGoodsCentsPerUnit = refPrices.goodsCentsPerUnit;

  return worldDraft;
}
