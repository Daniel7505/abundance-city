export type LaborStatus =
  | "employed"
  | "unemployed"
  | "not_in_labor_force"
  | "retraining"
  | "retired";

export interface HouseholdNeedsQuantity {
  housingServiceUnits: number;
  foodGoodsUnits: number;
  electricityKwh: number;
}

export interface Household {
  id: number;
  size: number;
  incomeAnnualUsd: number;
  isRenter: boolean;
  agentIds: number[];
  needsQuantity: HouseholdNeedsQuantity;
}

export interface AgentState {
  id: number;
  householdId: number;
  laborStatus: LaborStatus;
  industryIndex: number | null;
  skill: number;
  dailyWageCents: number;
  ageYears: number;
}

export interface BaselineEmploymentSlot {
  agentId: number;
  industryIndex: number;
}

export interface ReemploymentQueueEntry {
  agentId: number;
  enteredDay: number;
}

export interface M2bLaborState {
  queue: ReemploymentQueueEntry[];
  referencePriceIndex: number;
  queueHiresCumulative: number;
  reemploymentDelayDays: number[];
}

export interface M2aWorld {
  agents: AgentState[];
  households: Household[];
  industrySlotsBase: number[];
  baselineEmployment: BaselineEmploymentSlot[];
  baselineUnemployed: number[];
  baselineNotInLaborForce: number[];
  capitalShare: number[];
  referenceGoodsCentsPerUnit: number;
  m2b: M2bLaborState | null;
}
