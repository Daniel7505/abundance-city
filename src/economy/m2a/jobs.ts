import type { AgentState, M2aWorld } from "../../sim/m2a/types.js";
import { activeSlotsForIndustry } from "./dial.js";

export function applyAbundanceLayoffs(world: M2aWorld, abundance: number): void {
  const byIndustry: Array<Array<AgentState>> = world.industrySlotsBase.map(() => []);
  for (const agent of world.agents) {
    if (agent.laborStatus === "employed" && agent.industryIndex !== null) {
      byIndustry[agent.industryIndex].push(agent);
    }
  }

  for (let ind = 0; ind < world.industrySlotsBase.length; ind++) {
    const cap = activeSlotsForIndustry(world.industrySlotsBase[ind], abundance);
    const workers = byIndustry[ind].sort((a, b) => a.skill - b.skill);
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

export function industryEmploymentCounts(
  agents: AgentState[],
  industryCount: number,
): number[] {
  const counts = Array.from({ length: industryCount }, () => 0);
  for (const a of agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null) {
      counts[a.industryIndex] += 1;
    }
  }
  return counts;
}
