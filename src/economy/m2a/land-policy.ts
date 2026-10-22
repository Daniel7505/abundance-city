import coefficients from "../../../data/coefficients.json" with { type: "json" };
import { distributePoolByPolicy } from "./distribute.js";
import type { DividendPolicy } from "./policy.js";
import { LANDLORD_ACCOUNT, TREASURY_ACCOUNT } from "./accounts.js";
import type { Ledger } from "../ledger.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

export type LandPolicy =
  | { kind: "PrivateLandlords" }
  | { kind: "LandValueTax"; rate: number }
  | { kind: "CommunityLandTrust" };

export function parseLandPolicy(name: string): LandPolicy {
  switch (name) {
    case "PrivateLandlords":
      return { kind: "PrivateLandlords" };
    case "LandValueTax":
      return {
        kind: "LandValueTax",
        rate: (coefficients.landValueTax as { defaultRate: number }).defaultRate,
      };
    case "CommunityLandTrust":
      return { kind: "CommunityLandTrust" };
    default:
      throw new Error(`Unknown land policy: ${name}`);
  }
}

export function landPolicyLabel(policy: LandPolicy): string {
  if (policy.kind === "LandValueTax") return `LandValueTax(${policy.rate})`;
  return policy.kind;
}

export function settleLandRentPolicy(
  ledger: Ledger,
  world: M2aWorld,
  landPolicy: LandPolicy,
  dividendPolicy: DividendPolicy,
  agentInflows: Map<number, number>,
): number {
  const pool = ledger.getBalance(LANDLORD_ACCOUNT);
  if (pool <= 0) return 0;

  let distributed = 0;

  if (landPolicy.kind === "PrivateLandlords") {
    distributed += distributePoolByPolicy(
      ledger,
      LANDLORD_ACCOUNT,
      pool,
      { kind: "CapitalShare" },
      world.households,
      world.capitalShare,
      world.agents.length,
      "land_rent_private",
      agentInflows,
    );
    return distributed;
  }

  if (landPolicy.kind === "CommunityLandTrust") {
    distributed += distributePoolByPolicy(
      ledger,
      LANDLORD_ACCOUNT,
      pool,
      { kind: "EqualDividend" },
      world.households,
      world.capitalShare,
      world.agents.length,
      "land_rent_clt",
      agentInflows,
    );
    return distributed;
  }

  const tax = Math.floor(pool * landPolicy.rate);
  const privateRemainder = pool - tax;
  if (tax > 0) {
    ledger.transfer(LANDLORD_ACCOUNT, TREASURY_ACCOUNT, tax, "land_value_tax");
    distributed += distributePoolByPolicy(
      ledger,
      TREASURY_ACCOUNT,
      tax,
      dividendPolicy,
      world.households,
      world.capitalShare,
      world.agents.length,
      "land_value_tax_rebate",
      agentInflows,
    );
  }
  if (privateRemainder > 0) {
    distributed += distributePoolByPolicy(
      ledger,
      LANDLORD_ACCOUNT,
      privateRemainder,
      { kind: "CapitalShare" },
      world.households,
      world.capitalShare,
      world.agents.length,
      "land_rent_residual",
      agentInflows,
    );
  }
  return distributed;
}
