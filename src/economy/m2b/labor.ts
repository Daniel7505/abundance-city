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
  const ratio = ref / currentPriceIndex - 1;
  return Math.max(0, Math.floor(baseTotal * ratio));
}

export function automationSlotCaps(world: M2aWorld, abundance: number): number[] {
  const town = getTown();
  return world.industrySlotsBase.map((base, ind) => {
    const industryId = town.industry_employment_c24030[ind].id;
    const intensity = automatabilityForIndustry(industryId);
    return requiredSlots(base, abundance, intensity);
  });
}

export function extraQueueSlotCount(
  world: M2aWorld,
  abundance: number,
  currentPriceIndex: number,
): number {
  return demandBonusSlots(world, currentPriceIndex) + maintenanceJobSlots(abundance);
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

function fillExtraSlotsFromQueue(
  world: M2aWorld,
  caps: number[],
  extraSlots: number,
  dayIndex: number,
): void {
  const delay = m2bEconomy.retrainingDelayDays;
  const m2b = world.m2b;
  if (!m2b) throw new Error("M2b labor state missing");

  const kept: ReemploymentQueueEntry[] = [];
  const eligible: ReemploymentQueueEntry[] = [];
  for (const entry of m2b.queue) {
    if (dayIndex - entry.enteredDay >= delay) eligible.push(entry);
    else kept.push(entry);
  }

  let remaining = extraSlots;
  let ind = 0;
  let ei = 0;
  while (remaining > 0 && ei < eligible.length && caps.length > 0) {
    const entry = eligible[ei++];
    const industryIndex = ind % caps.length;
    ind += 1;
    const agent = world.agents[entry.agentId];
    agent.laborStatus = "employed";
    agent.industryIndex = industryIndex;
    m2b.queueHiresCumulative += 1;
    m2b.reemploymentDelayDays.push(dayIndex - entry.enteredDay);
    remaining -= 1;
  }

  for (; ei < eligible.length; ei++) {
    kept.push(eligible[ei]);
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
  const automationCaps = automationSlotCaps(world, abundance);

  for (let ind = 0; ind < automationCaps.length; ind++) {
    trimIndustryToCap(world, ind, automationCaps[ind]);
  }

  for (const agentId of baselineEmployed) {
    const a = world.agents[agentId];
    if (a.laborStatus === "employed") continue;
    if (structuralUnemployed.has(agentId)) continue;
    enqueueDisplaced(world, agentId, dayIndex);
  }

  const extra = extraQueueSlotCount(world, abundance, currentPriceIndex);
  fillExtraSlotsFromQueue(world, automationCaps, extra, dayIndex);
}

export function initM2bLaborState(world: M2aWorld, referencePriceIndex: number): void {
  world.m2b = {
    queue: [],
    referencePriceIndex,
    queueHiresCumulative: 0,
    reemploymentDelayDays: [],
  };
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

export function medianReemploymentDelayDays(world: M2aWorld): number {
  const delays = world.m2b?.reemploymentDelayDays ?? [];
  if (delays.length === 0) return 0;
  const sorted = [...delays].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
