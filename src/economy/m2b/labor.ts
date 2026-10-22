import coefficients from "../../../data/coefficients.json" with { type: "json" };
import m2bEconomy from "../../../config/m2b-economy.json" with { type: "json" };
import { getTown } from "../../town/lindsborg.js";
import {
  automatabilityForIndustry,
  countDisplaced,
  requiredSlots,
} from "../m2a/labor.js";
import type {
  AgentState,
  M2aWorld,
  ReemploymentQueueEntry,
} from "../../sim/m2a/types.js";

function maintenanceJobSlots(abundance: number): number {
  const cfg = coefficients.automatedProducerMaintenanceJobs as {
    slotsPerAbundanceUnit: number;
  };
  return Math.max(0, Math.round(abundance * cfg.slotsPerAbundanceUnit));
}

function demandBonusSlots(world: M2aWorld, currentPriceIndex: number): number {
  const ref = world.m2b?.referencePriceIndex ?? currentPriceIndex;
  if (ref <= 0 || currentPriceIndex >= ref) return 0;
  const baseTotal = world.industrySlotsBase.reduce((s, n) => s + n, 0);
  return Math.max(0, Math.floor(baseTotal * (ref / currentPriceIndex - 1)));
}

export function industrySlotCaps(
  world: M2aWorld,
  abundance: number,
  currentPriceIndex: number,
): number[] {
  const town = getTown();
  const caps = world.industrySlotsBase.map((base, ind) => {
    const industryId = town.industry_employment_c24030[ind].id;
    const intensity = automatabilityForIndustry(industryId);
    return requiredSlots(base, abundance, intensity);
  });

  let bonus = demandBonusSlots(world, currentPriceIndex) + maintenanceJobSlots(abundance);
  let idx = 0;
  while (bonus > 0 && caps.length > 0) {
    caps[idx % caps.length] += 1;
    bonus -= 1;
    idx += 1;
  }
  return caps;
}

function enqueueDisplaced(world: M2aWorld, agentId: number, dayIndex: number): void {
  const agent = world.agents[agentId];
  const m2b = world.m2b;
  if (!m2b) throw new Error("M2b labor state missing");
  const queue = m2b.queue;
  if (queue.some((e) => e.agentId === agentId)) return;
  if (agent.laborStatus === "retired") return;

  if (agent.ageYears >= m2bEconomy.earlyRetirementAgeYears) {
    agent.laborStatus = "retired";
    agent.industryIndex = null;
    return;
  }

  agent.laborStatus = "retraining";
  agent.industryIndex = null;
  queue.push({ agentId, enteredDay: dayIndex });
}

function trimIndustryToCap(world: M2aWorld, industryIndex: number, cap: number): void {
  const workers = world.agents
    .filter((a) => a.laborStatus === "employed" && a.industryIndex === industryIndex)
    .sort((a, b) => a.skill - b.skill || a.id - b.id);
  for (let i = cap; i < workers.length; i++) {
    workers[i].laborStatus = "unemployed";
    workers[i].industryIndex = null;
  }
}

function fillVacanciesFromQueue(world: M2aWorld, caps: number[], dayIndex: number): void {
  const delay = m2bEconomy.retrainingDelayDays;
  const kept: ReemploymentQueueEntry[] = [];
  const eligible: ReemploymentQueueEntry[] = [];
  const m2b = world.m2b;
  if (!m2b) throw new Error("M2b labor state missing");

  for (const entry of m2b.queue) {
    if (dayIndex - entry.enteredDay >= delay) eligible.push(entry);
    else kept.push(entry);
  }

  const vacancies: number[] = [];
  for (let ind = 0; ind < caps.length; ind++) {
    const employed = world.agents.filter(
      (a) => a.laborStatus === "employed" && a.industryIndex === ind,
    ).length;
    for (let k = employed; k < caps[ind]; k++) vacancies.push(ind);
  }

  let v = 0;
  for (const entry of eligible) {
    if (v >= vacancies.length) {
      kept.push(entry);
      continue;
    }
    const agent = world.agents[entry.agentId];
    agent.laborStatus = "employed";
    agent.industryIndex = vacancies[v++];
  }

  m2b.queue = kept;
}

export function applyM2bLaborForDay(
  world: M2aWorld,
  abundance: number,
  dayIndex: number,
  currentPriceIndex: number,
): void {
  const m2b = world.m2b;
  if (!m2b) throw new Error("M2b labor state missing");

  const structuralUnemployed = new Set(world.baselineUnemployed);
  const baselineEmployed = new Set(world.baselineEmployment.map((s) => s.agentId));
  const caps = industrySlotCaps(world, abundance, currentPriceIndex);

  for (let ind = 0; ind < caps.length; ind++) {
    trimIndustryToCap(world, ind, caps[ind]);
  }

  for (const agentId of baselineEmployed) {
    const a = world.agents[agentId];
    if (a.laborStatus === "employed") continue;
    if (structuralUnemployed.has(agentId)) continue;
    enqueueDisplaced(world, agentId, dayIndex);
  }

  fillVacanciesFromQueue(world, caps, dayIndex);
}

export function initM2bLaborState(world: M2aWorld, referencePriceIndex: number): void {
  world.m2b = { queue: [], referencePriceIndex };
}

export function countQueued(world: M2aWorld): number {
  return world.m2b?.queue.length ?? 0;
}

export function countRetired(agents: AgentState[]): number {
  return agents.filter((a) => a.laborStatus === "retired").length;
}

export function countDisplacedM2b(world: M2aWorld): number {
  return countDisplaced(world);
}
