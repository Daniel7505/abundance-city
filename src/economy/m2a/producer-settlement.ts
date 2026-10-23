import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { distributePoolByPolicy } from "./distribute.js";
import type { DividendPolicy } from "./policy.js";
import {
  distributeAutomatedProducerResidual,
  type ProducerOwnershipState,
} from "./producer-ownership.js";
import { PRODUCER_ACCOUNT } from "./accounts.js";
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
  /** Cash returned to the households that paid, not counted as income. */
  rebateCents: number;
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
  // Non-labor cost is already in the goods price. Paying it from the producer
  // to the treasury hands it back as a policy transfer, and those transfers
  // are outside the spend window, so the cents leave the wage circuit and the
  // firm float drains. The receipt stays here. The price markup is the
  // ownership residual. Rebound wages are paid from the rest, and the next
  // day's hiring is capped at a wage bill that rest can meet.
  void abundance;
  const demandWorkers = world.agents
    .filter((a) => a.laborStatus === "employed" && a.demandSlotEmployment)
    .map((a) => ({
      id: a.id,
      industryIndex: a.industryIndex ?? 0,
      targetCents: a.dailyWageCents,
    }));
  const wageTarget = demandWorkers.reduce((s, w) => s + w.targetCents, 0);
  const aboveFloat = Math.max(
    0,
    ledger.getBalance(PRODUCER_ACCOUNT) - PRODUCER_WORKING_FLOAT_CENTS,
  );
  const ownershipReserve = Math.min(
    aboveFloat,
    Math.floor(producerInflowCents * m2aEconomy.firmMarkup),
  );
  const wagePool = aboveFloat - ownershipReserve;
  if (world.m2b) {
    let wageSum = 0;
    let wageN = 0;
    for (const a of world.agents) {
      if (a.laborStatus === "employed" && a.dailyWageCents > 0) {
        wageSum += a.dailyWageCents;
        wageN += 1;
      }
    }
    const avgWage = wageN > 0 ? Math.round(wageSum / wageN) : 0;
    // Half the jobs today's pool can carry. The cap has to be allowed to
    // fall: a high early residual (the ACS trailing window) otherwise hires
    // demand workers permanently, and their wages then consume the residual
    // that was supposed to fund them.
    const slots = avgWage > 0 ? Math.floor(wagePool / avgWage / 2) : 0;
    world.m2b.fundableDemandSlots = slots;
  }
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
  // What remains after human wages and rebound wages is the margin in the
  // automated price. It is ownership income (public ownership can take it).
  // Leaving it unspent, or paying it to the treasury, drops the goods bill
  // below the wage claim and the firm float drains. Non-labor cost is not
  // a second cash transfer; it is already inside this margin.
  const ownershipSlice = distributable;
  const rebateCents = 0;
  let distributed = 0;
  if (ownershipSlice > 0) {
    if (ownership && ownership.mode !== "PrivateOwners") {
      distributed = distributeAutomatedProducerResidual(
        ledger,
        world,
        policy,
        ownershipSlice,
        ownership,
        agentDividends,
      );
    } else {
      distributed = distributePoolByPolicy(
        ledger,
        PRODUCER_ACCOUNT,
        ownershipSlice,
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
    producerOperatingCostCents: 0,
    producerWageTargetCents: wageTarget,
    producerWagesPaidCents: wagesPaid,
    producerDistributedCents: distributed,
    rebateCents,
  };
}
