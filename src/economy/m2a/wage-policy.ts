/**
 * How a human firm covers its wage bill.
 *
 * MarketWages is the default. The firm pays wages from its own human-variant
 * receipts and its payroll float. A shortfall is a labor-market outcome
 * (layoffs, then a pay cut on the marginal job). The automated producer does
 * not transfer cash to the firm.
 *
 * WageGuarantee is a redistribution policy, alongside land and ownership. The
 * producer tops the firm up to payroll. Machine owners fund human wages.
 */
export type WagePolicyName = "MarketWages" | "WageGuarantee";

export function parseWagePolicy(name: string | undefined): WagePolicyName {
  if (name === undefined || name === "") return "MarketWages";
  if (name === "MarketWages" || name === "WageGuarantee") return name;
  throw new Error(`Unknown wage policy: ${name}`);
}
