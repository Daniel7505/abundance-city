import coefficients from "../../../data/coefficients.json" with { type: "json" };
import { getTown } from "../../town/lindsborg.js";
import type { AgentState, M2aWorld } from "../../sim/m2a/types.js";

function automatabilityForIndustry(industryId: string): number {
  const map = coefficients.industryAutomatabilityIntensity as Record<string, number | string>;
  const v = map[industryId];
  return typeof v === "number" ? v : 0.4;
}

export function requiredSlots(baseSlots: number, abundance: number, intensity: number): number {
  const removed = Math.round(baseSlots * abundance * intensity);
  return Math.max(0, baseSlots - removed);
}

export function restoreBaselineEmployment(world: M2aWorld): void {
  for (const a of world.agents) {
    a.laborStatus = "not_in_labor_force";
    a.industryIndex = null;
  }
  for (const id of world.baselineNotInLaborForce) {
    world.agents[id].laborStatus = "not_in_labor_force";
  }
  for (const id of world.baselineUnemployed) {
    world.agents[id].laborStatus = "unemployed";
  }
  for (const slot of world.baselineEmployment) {
    const agent = world.agents[slot.agentId];
    agent.laborStatus = "employed";
    agent.industryIndex = slot.industryIndex;
  }
}

export function applyLaborForAbundance(world: M2aWorld, abundance: number): void {
  restoreBaselineEmployment(world);
  const town = getTown();
  for (let ind = 0; ind < world.industrySlotsBase.length; ind++) {
    const industryId = town.industry_employment_c24030[ind].id;
    const intensity = automatabilityForIndustry(industryId);
    const cap = requiredSlots(world.industrySlotsBase[ind], abundance, intensity);
    const workers = world.agents
      .filter((a) => a.laborStatus === "employed" && a.industryIndex === ind)
      .sort((a, b) => a.skill - b.skill || a.id - b.id);
    for (let i = 0; i < workers.length; i++) {
      if (i >= cap) {
        workers[i].laborStatus = "unemployed";
        workers[i].industryIndex = null;
      }
    }
  }
}

export function countEmployed(agents: AgentState[]): number {
  return agents.filter((a) => a.laborStatus === "employed").length;
}

export function countDisplaced(world: M2aWorld): number {
  let n = 0;
  for (const slot of world.baselineEmployment) {
    const a = world.agents[slot.agentId];
    if (a.laborStatus !== "employed") n += 1;
  }
  return n;
}
