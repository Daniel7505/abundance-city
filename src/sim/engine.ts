import { CITIZEN_COUNT } from "./config.js";
import { createCitizen, stepCitizen, type Citizen } from "./citizen.js";
import { assignHomesAndWorks } from "./grid.js";
import { SeededPrng } from "./prng.js";
import type { AgentTickLog, RunSummary, SimRunResult } from "./types.js";

export interface SimOptions {
  seed: number;
  ticks: number;
}

export function createSimulation(seed: number): Citizen[] {
  const prng = new SeededPrng(seed);
  const { homes, works } = assignHomesAndWorks(prng);
  const citizens: Citizen[] = [];
  for (let i = 0; i < CITIZEN_COUNT; i++) {
    citizens.push(createCitizen(i, homes[i], works[i]));
  }
  return citizens;
}

export function runSimulation(options: SimOptions): SimRunResult {
  const citizens = createSimulation(options.seed);
  const tickLogs: string[] = [];

  for (let tick = 0; tick < options.ticks; tick++) {
    for (const citizen of citizens) {
      stepCitizen(citizen);
      const entry: AgentTickLog = {
        tick,
        agentId: citizen.id,
        x: citizen.x,
        y: citizen.y,
        cumulativeWh: citizen.cumulativeWh,
      };
      tickLogs.push(JSON.stringify(entry));
    }
  }

  const perAgentEnergyWh: Record<string, number> = {};
  let totalEnergyWh = 0;
  for (const c of citizens) {
    perAgentEnergyWh[String(c.id)] = c.cumulativeWh;
    totalEnergyWh += c.cumulativeWh;
  }

  const summary: RunSummary = {
    seed: options.seed,
    ticks: options.ticks,
    totalEnergyWh,
    perAgentEnergyWh,
  };

  return { tickLogs, summary };
}

/** Expose read-only snapshot for the Three.js viewer. */
export interface SimSnapshot {
  seed: number;
  tick: number;
  citizens: Array<{ id: number; x: number; y: number; cumulativeWh: number }>;
}

export class SimRunner {
  private citizens: Citizen[];
  private currentTick = 0;

  constructor(seed: number) {
    this.citizens = createSimulation(seed);
  }

  get tick(): number {
    return this.currentTick;
  }

  step(): void {
    for (const citizen of this.citizens) {
      stepCitizen(citizen);
    }
    this.currentTick += 1;
  }

  snapshot(): SimSnapshot {
    return {
      seed: 0,
      tick: this.currentTick,
      citizens: this.citizens.map((c) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        cumulativeWh: c.cumulativeWh,
      })),
    };
  }

  getCitizens(): readonly Citizen[] {
    return this.citizens;
  }
}
