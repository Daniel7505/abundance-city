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
import type { AgentState, Household, M2aWorld } from "./types.js";

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

  const agents: AgentState[] = [];
  for (const hh of households) {
    const workersInHh = hh.agentIds.length;
    const dailyWageCents = Math.floor(
      (hh.incomeAnnualUsd * 100) / 365 / Math.max(1, workersInHh),
    );
    for (const id of hh.agentIds) {
      agents.push({
        id,
        householdId: hh.id,
        laborStatus: "not_in_labor_force",
        industryIndex: null,
        skill: prng.next(),
        dailyWageCents,
      });
    }
  }

  const laborForceIds = [...agents]
    .sort((a, b) => a.id - b.id)
    .slice(0, scaledLaborForceCount())
    .map((a) => a.id);
  const unemployedCount = scaledUnemployedCount();
  const unemployedIds = new Set(
    laborForceIds.slice(laborForceIds.length - unemployedCount),
  );
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

  return {
    agents,
    households,
    industrySlotsBase: employedSlots,
  };
}
