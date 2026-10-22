export interface AgentTickLog {
  tick: number;
  agentId: number;
  x: number;
  y: number;
  cumulativeWh: number;
}

export interface RunSummary {
  seed: number;
  ticks: number;
  totalEnergyWh: number;
  perAgentEnergyWh: Record<string, number>;
}

export interface SimRunResult {
  tickLogs: string[];
  summary: RunSummary;
}
