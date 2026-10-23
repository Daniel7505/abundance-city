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
  /** Calibrated so a=0 housing share of needs matches ACS-style quintile burden. */
  housingBurdenMultiplier: number;
}

export interface AgentState {
  id: number;
  householdId: number;
  laborStatus: LaborStatus;
  industryIndex: number | null;
  /** M2b: true when employed via demand/maintenance queue slots (not automation caps). */
  demandSlotEmployment: boolean;
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
  hiresToday: number;
  separationsToday: number;
  separationsCumulative: number;
  /**
   * Rebound jobs the producer can pay in full from the post-cost residual.
   * Labor uses this as a cap so a price drop cannot hire a wage bill the
   * producer cannot meet. Updated at the end of each producer settlement.
   */
  fundableDemandSlots: number;
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
  /** Weighted basket price at abundance 0 (worldgen); metrics normalize to base 100. */
  referenceBasketPriceIndex: number;
  m2b: M2bLaborState | null;
}
