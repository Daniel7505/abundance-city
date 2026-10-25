import type { WagePolicyName } from "../m2a/wage-policy.js";

/**
 * One sector's cost structure. Every field is an assumption, except where
 * housing is filled from the dwelling-rent coefficients.
 *
 * laborShare0 is labor's share of unit cost at abundance 0.
 * automatability is the fraction of that labor shed at abundance 1 under
 * MarketWages. WageGuarantee does not shed it.
 * nonlaborCostDeclineAtFullAutomation is the fraction of nonlabor unit cost
 * removed at abundance 1.
 * outputGrowthAtFullAutomation is the extra supply at abundance 1. The wage
 * bill does not grow with it.
 * pricePassThrough is the fraction of the unit-cost decline that shows up
 * in the consumer price. The rest stays in the surplus.
 */
export interface SectorCostParameters {
  laborShare0: number;
  automatability: number;
  nonlaborCostDeclineAtFullAutomation: number;
  outputGrowthAtFullAutomation: number;
  pricePassThrough: number;
}

export interface SectorYearPnL {
  abundance: number;
  wagePolicy: WagePolicyName;
  outputIndex: number;
  unitLaborCostIndex: number;
  unitNonlaborCostIndex: number;
  unitCostIndex: number;
  /** Labor's share of this year's unit cost. */
  laborShare: number;
  /** Wage bill divided by the year-0 wage bill. Year 0 is 1. */
  wageBillIndex: number;
  /** Top-up that brings the market wage bill back to the year-0 bill, as a fraction of year-0 total cost. Zero under MarketWages. */
  wageTopUpIndex: number;
  priceIndex: number;
  revenueIndex: number;
  nonlaborBillIndex: number;
  surplusIndex: number;
}

export function outputIndexAt(abundance: number, params: SectorCostParameters): number {
  return 1 + abundance * params.outputGrowthAtFullAutomation;
}

/**
 * Yearly sector P&L at one abundance, as indexes with year 0 equal to 1.
 *
 * MarketWages pays only the labor automation has not shed. WageGuarantee
 * pays the year-0 wage bill, which is the roadmap form of leaving the staff
 * in place. Unit labor cost is that bill divided by output, so extra supply
 * lowers the labor cost per unit under both policies, and shedding labor
 * lowers it only under MarketWages.
 */
export function sectorYearPnL(
  abundance: number,
  wagePolicy: WagePolicyName,
  params: SectorCostParameters,
): SectorYearPnL {
  if (abundance < 0 || abundance > 1) {
    throw new Error(`Abundance must be in [0,1], got ${abundance}`);
  }
  const outputIndex = outputIndexAt(abundance, params);
  if (outputIndex <= 0) {
    throw new Error(`Output index must stay positive, got ${outputIndex}`);
  }

  const laborStillNeeded = 1 - abundance * params.automatability;
  const marketWageBillOverYear0Cost = params.laborShare0 * laborStillNeeded;
  const guaranteeWageBillOverYear0Cost = params.laborShare0;
  const wageBillOverYear0Cost =
    wagePolicy === "WageGuarantee" ? guaranteeWageBillOverYear0Cost : marketWageBillOverYear0Cost;
  const wageTopUpIndex =
    wagePolicy === "WageGuarantee"
      ? Math.max(0, guaranteeWageBillOverYear0Cost - marketWageBillOverYear0Cost)
      : 0;

  const unitLaborCostIndex = wageBillOverYear0Cost / outputIndex;
  const unitNonlaborCostIndex =
    (1 - params.laborShare0) * (1 - abundance * params.nonlaborCostDeclineAtFullAutomation);
  const unitCostIndex = unitLaborCostIndex + unitNonlaborCostIndex;
  const laborShare = unitCostIndex > 0 ? unitLaborCostIndex / unitCostIndex : 0;
  const priceIndex = 1 - params.pricePassThrough * (1 - unitCostIndex);
  const revenueIndex = priceIndex * outputIndex;
  const nonlaborBillIndex = unitNonlaborCostIndex * outputIndex;
  const surplusIndex = revenueIndex - wageBillOverYear0Cost - nonlaborBillIndex;
  const wageBillIndex = params.laborShare0 > 0 ? wageBillOverYear0Cost / params.laborShare0 : 1;

  return {
    abundance,
    wagePolicy,
    outputIndex,
    unitLaborCostIndex,
    unitNonlaborCostIndex,
    unitCostIndex,
    laborShare,
    wageBillIndex,
    wageTopUpIndex,
    priceIndex,
    revenueIndex,
    nonlaborBillIndex,
    surplusIndex,
  };
}
