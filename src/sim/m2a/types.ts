export type LaborStatus = "employed" | "unemployed" | "not_in_labor_force";

export interface Household {
  id: number;
  size: number;
  incomeAnnualUsd: number;
  isRenter: boolean;
  agentIds: number[];
}

export interface AgentState {
  id: number;
  householdId: number;
  laborStatus: LaborStatus;
  industryIndex: number | null;
  skill: number;
  dailyWageCents: number;
}

export interface BaselineEmploymentSlot {
  agentId: number;
  industryIndex: number;
}

export interface M2aWorld {
  agents: AgentState[];
  households: Household[];
  industrySlotsBase: number[];
  baselineEmployment: BaselineEmploymentSlot[];
  baselineUnemployed: number[];
  baselineNotInLaborForce: number[];
  capitalShare: number[];
}
