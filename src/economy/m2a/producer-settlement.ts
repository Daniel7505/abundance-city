import { distributePoolByPolicy } from "./distribute.js";
import type { DividendPolicy } from "./policy.js";
import {
  distributeAutomatedProducerResidual,
  type ProducerOwnershipState,
} from "./producer-ownership.js";
import { PRODUCER_ACCOUNT, TREASURY_ACCOUNT } from "./accounts.js";
import {
  automatedProducerNonLaborUnitCostCents,
  producerPriceCents,
} from "./prices.js";
import { payWagePoolProRata } from "./wage-pool.js";
import type { Ledger } from "../ledger.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

export const PRODUCER_WORKING_FLOAT_CENTS = 100_000;

export interface ProducerSettlementResult {
  producerInflowCents: number;
  producerOperatingCostCents: number;
  producerWageTargetCents: number;
  producerWagesPaidCents: number;
  producerDistributedCents: number;
}

export function settleProducerAccount(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  policy: DividendPolicy,
  producerInflowCents: number,
  wagePaidByAgent: Map<number, number>,
  agentDividends: Map<number, number>,
  ownership?: ProducerOwnershipState,
): ProducerSettlementResult {
  const price = producerPriceCents(abundance);
  const goodsUnits = price > 0 ? producerInflowCents / price : 0;
  const operatingCost = Math.round(goodsUnits * automatedProducerNonLaborUnitCostCents(abundance));
  if (operatingCost > 0) {
    ledger.transferUpTo(
      PRODUCER_ACCOUNT,
      TREASURY_ACCOUNT,
      operatingCost,
      "producer_operating_cost",
    );
  }

  const demandWorkers = world.agents
    .filter((a) => a.laborStatus === "employed" && a.demandSlotEmployment)
    .map((a) => ({
      id: a.id,
      industryIndex: a.industryIndex ?? 0,
      targetCents: a.dailyWageCents,
    }));
  const wageTarget = demandWorkers.reduce((s, w) => s + w.targetCents, 0);
  const wagePool = Math.max(0, ledger.getBalance(PRODUCER_ACCOUNT) - PRODUCER_WORKING_FLOAT_CENTS);
  const wagesPaid = payWagePoolProRata(
    ledger,
    PRODUCER_ACCOUNT,
    demandWorkers,
    wagePool,
    "producer_demand_wage",
    wagePaidByAgent,
    world.agents,
  );

  const distributable = Math.max(
    0,
    ledger.getBalance(PRODUCER_ACCOUNT) - PRODUCER_WORKING_FLOAT_CENTS,
  );
  let distributed = 0;
  if (distributable > 0) {
    if (ownership && ownership.mode !== "PrivateOwners") {
      distributed = distributeAutomatedProducerResidual(
        ledger,
        world,
        policy,
        distributable,
        ownership,
        agentDividends,
      );
    } else {
      distributed = distributePoolByPolicy(
        ledger,
        PRODUCER_ACCOUNT,
        distributable,
        policy,
        world.households,
        world.capitalShare,
        world.agents.length,
        "automated_producer_residual",
        agentDividends,
      );
    }
  }

  return {
    producerInflowCents,
    producerOperatingCostCents: operatingCost,
    producerWageTargetCents: wageTarget,
    producerWagesPaidCents: wagesPaid,
    producerDistributedCents: distributed,
  };
}
