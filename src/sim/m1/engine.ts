import economy from "../../../config/economy.json" with { type: "json" };
import { Ledger } from "../../economy/ledger.js";
import { assignJobs, type JobAssignment } from "../../economy/jobs.js";
import { settleDay } from "../../economy/daily.js";
import { allAccountIds } from "../../economy/accounts.js";
import type { AgentTickLog, RunSummary } from "../types.js";
import { createM1Citizen, setCitizenWorkplace, stepM1Citizen } from "./citizen-m1.js";
import { buildM1World } from "./world.js";
import { DailyMetricsCollector, type DailyMetricLine } from "./metrics.js";
import type { Citizen } from "../citizen.js";

export interface M1SimOptions {
  seed: number;
  days: number;
  abundance: number;
}

export interface M1SimResult {
  tickLogs: string[];
  dailyMetrics: string[];
  summary: RunSummary & {
    abundance: number;
    days: number;
    mode: "m1";
    moneySupplyCents: number;
    finalDayMetrics: DailyMetricLine | null;
    accountBalancesCents: Record<string, number>;
  };
}

function defaultWorkForCitizen(
  citizenId: number,
  world: ReturnType<typeof buildM1World>,
): { x: number; y: number } {
  const wp = citizenId % world.workplaces.length;
  return world.workplaces[wp];
}

function applyAssignments(
  citizens: Citizen[],
  world: ReturnType<typeof buildM1World>,
  assignments: JobAssignment[],
): void {
  for (const c of citizens) {
    const job = assignments[c.id];
    const work =
      job.employed && job.workplaceId !== null
        ? world.workplaces[job.workplaceId]
        : defaultWorkForCitizen(c.id, world);
    setCitizenWorkplace(c, work);
  }
}

function assertMoneyInvariant(ledger: Ledger): void {
  if (ledger.totalSupplyCents() !== ledger.initialSupplyCents) {
    throw new Error("Money supply changed");
  }
  for (const id of allAccountIds()) {
    if (ledger.getBalance(id) < 0) {
      throw new Error(`Negative balance on ${id}`);
    }
  }
}

export function runM1Simulation(options: M1SimOptions): M1SimResult {
  const world = buildM1World();
  const ledger = new Ledger();
  const citizens: Citizen[] = [];
  for (let id = 0; id < economy.citizenCount; id++) {
    const home = world.homes[world.citizenHomeIndex[id]];
    const work = defaultWorkForCitizen(id, world);
    citizens.push(createM1Citizen(id, home, work));
  }

  let assignments = assignJobs(
    options.abundance,
    world.homes,
    world.workplaces,
    world.citizenHomeIndex,
  );
  applyAssignments(citizens, world, assignments);

  const tickLogs: string[] = [];
  const dailyMetrics: string[] = [];
  const metricsCollector = new DailyMetricsCollector();
  const totalTicks = options.days * economy.ticksPerDay;
  let finalDayMetrics: DailyMetricLine | null = null;

  for (let tick = 0; tick < totalTicks; tick++) {
    for (const citizen of citizens) {
      stepM1Citizen(citizen);
      const entry: AgentTickLog = {
        tick,
        agentId: citizen.id,
        x: citizen.x,
        y: citizen.y,
        cumulativeWh: citizen.cumulativeWh,
      };
      tickLogs.push(JSON.stringify(entry));
    }

    if (tick % economy.ticksPerDay === economy.settlementTickOfDay) {
      const dayIndex = Math.floor(tick / economy.ticksPerDay);
      const settlement = settleDay(
        ledger,
        options.abundance,
        assignments,
        dayIndex,
        tick,
      );
      const line = metricsCollector.record(settlement);
      dailyMetrics.push(JSON.stringify(line));
      finalDayMetrics = line;

      assignments = assignJobs(
        options.abundance,
        world.homes,
        world.workplaces,
        world.citizenHomeIndex,
      );
      applyAssignments(citizens, world, assignments);
    }

    assertMoneyInvariant(ledger);
  }

  const perAgentEnergyWh: Record<string, number> = {};
  let totalEnergyWh = 0;
  for (const c of citizens) {
    perAgentEnergyWh[String(c.id)] = c.cumulativeWh;
    totalEnergyWh += c.cumulativeWh;
  }

  const accountBalancesCents: Record<string, number> = {};
  for (const id of allAccountIds()) {
    accountBalancesCents[id] = ledger.getBalance(id);
  }

  return {
    tickLogs,
    dailyMetrics,
    summary: {
      seed: options.seed,
      ticks: totalTicks,
      totalEnergyWh,
      perAgentEnergyWh,
      abundance: options.abundance,
      days: options.days,
      mode: "m1",
      moneySupplyCents: ledger.initialSupplyCents,
      finalDayMetrics,
      accountBalancesCents,
    },
  };
}
