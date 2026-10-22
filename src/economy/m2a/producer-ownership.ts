import coefficients from "../../../data/coefficients.json" with { type: "json" };
import type { M2aWorld } from "../../sim/m2a/types.js";
import type { Ledger } from "../ledger.js";
import { PUBLIC_FUND_ACCOUNT, PRODUCER_ACCOUNT } from "./accounts.js";
import { distributePoolByPolicy } from "./distribute.js";
import type { DividendPolicy } from "./policy.js";

export type ProducerOwnershipMode = "PrivateOwners" | "PublicFund" | "GradualBuyIn";

export interface ProducerOwnershipState {
  mode: ProducerOwnershipMode;
  /** Share of producer equity held by the city fund, in [0, 1]. */
  publicShare: number;
  /** Gradual-buy-in equity, in book cents. Unused by PrivateOwners and PublicFund. */
  publicBookCents: number;
  /**
   * Fraction of the producer residual levied into the fund under GradualBuyIn.
   * Defaults to producerOwnership.profitLevyRate. A run may override it.
   */
  profitLevyRate: number;
}

interface ProducerOwnershipCoefficients {
  defaultMode?: string;
  publicEquityShare: number;
  profitLevyRate: number;
  reinvestFraction: number;
  bookValueCents: number;
}

function ownershipCoefficients(): ProducerOwnershipCoefficients {
  return coefficients.producerOwnership as ProducerOwnershipCoefficients;
}

function bpsCap(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return 0;
  const bps = Math.round(rate * 10_000);
  if (bps > 10_000) return 10_000;
  return bps;
}

function takeBps(amount: number, bps: number): number {
  if (amount <= 0 || bps <= 0) return 0;
  return Number((BigInt(amount) * BigInt(bps)) / 10_000n);
}

function mulDivFloor(a: number, b: number, d: number): number {
  if (d <= 0 || a <= 0 || b <= 0) return 0;
  return Number((BigInt(a) * BigInt(b)) / BigInt(d));
}

export function parseProducerOwnershipMode(name: string | undefined): ProducerOwnershipMode {
  const raw = name === undefined || name === "" ? ownershipCoefficients().defaultMode : name;
  if (raw === "PrivateOwners" || raw === "PublicFund" || raw === "GradualBuyIn") return raw;
  throw new Error(`Unknown producer ownership: ${raw}`);
}

export function createProducerOwnershipState(
  mode: ProducerOwnershipMode,
  overrides?: { profitLevyRate?: number },
): ProducerOwnershipState {
  const cfg = ownershipCoefficients();
  const share = mode === "PublicFund" ? Math.min(1, Math.max(0, cfg.publicEquityShare)) : 0;
  const profitLevyRate = overrides?.profitLevyRate ?? cfg.profitLevyRate;
  if (!Number.isFinite(profitLevyRate) || profitLevyRate < 0) {
    throw new Error("profitLevyRate must be a non-negative finite number");
  }
  return { mode, publicShare: share, publicBookCents: 0, profitLevyRate };
}

function payFundBalanceAsEqualDividend(
  ledger: Ledger,
  world: M2aWorld,
  agentDividends: Map<number, number>,
): number {
  const payout = ledger.getBalance(PUBLIC_FUND_ACCOUNT);
  if (payout <= 0) return 0;
  return distributePoolByPolicy(
    ledger,
    PUBLIC_FUND_ACCOUNT,
    payout,
    { kind: "EqualDividend" },
    world.households,
    world.capitalShare,
    world.agents.length,
    "public_fund_dividend",
    agentDividends,
  );
}

/**
 * Split the producer residual.
 * PrivateOwners is not handled here — the caller keeps the historical distribution.
 * Public slices are paid as an equal per-household dividend. The private remainder
 * follows the run's dividend policy. Gradual buy-in reinvests a fraction of fund
 * income into equity priced at the placeholder book value.
 */
export function distributeAutomatedProducerResidual(
  ledger: Ledger,
  world: M2aWorld,
  policy: DividendPolicy,
  distributable: number,
  state: ProducerOwnershipState,
  agentDividends: Map<number, number>,
): number {
  if (distributable <= 0) return 0;
  const cfg = ownershipCoefficients();
  let left = distributable;

  if (state.mode === "GradualBuyIn") {
    const levy = takeBps(left, bpsCap(state.profitLevyRate));
    if (levy > 0) {
      ledger.transfer(PRODUCER_ACCOUNT, PUBLIC_FUND_ACCOUNT, levy, "producer_profit_levy");
      left -= levy;
    }
    const book = Math.floor(cfg.bookValueCents);
    if (!Number.isInteger(book) || book <= 0) {
      throw new Error("producerOwnership.bookValueCents must be a positive integer");
    }
    const publicDiv = mulDivFloor(left, state.publicBookCents, book);
    if (publicDiv > 0) {
      ledger.transfer(PRODUCER_ACCOUNT, PUBLIC_FUND_ACCOUNT, publicDiv, "producer_public_dividend");
      left -= publicDiv;
    }
  } else if (state.mode === "PublicFund") {
    state.publicShare = Math.min(1, Math.max(0, cfg.publicEquityShare));
    const publicDiv = takeBps(left, bpsCap(state.publicShare));
    if (publicDiv > 0) {
      ledger.transfer(PRODUCER_ACCOUNT, PUBLIC_FUND_ACCOUNT, publicDiv, "producer_public_dividend");
      left -= publicDiv;
    }
  } else {
    throw new Error(`distributeAutomatedProducerResidual does not handle ${state.mode}`);
  }

  let moved = 0;
  if (left > 0) {
    moved += distributePoolByPolicy(
      ledger,
      PRODUCER_ACCOUNT,
      left,
      policy,
      world.households,
      world.capitalShare,
      world.agents.length,
      "automated_producer_residual",
      agentDividends,
    );
  }

  if (state.mode === "GradualBuyIn") {
    const book = Math.floor(cfg.bookValueCents);
    const fundBal = ledger.getBalance(PUBLIC_FUND_ACCOUNT);
    const budget = takeBps(fundBal, bpsCap(cfg.reinvestFraction));
    const room = Math.max(0, book - state.publicBookCents);
    const payment = Math.min(budget, room);
    if (payment > 0) {
      const sold = distributePoolByPolicy(
        ledger,
        PUBLIC_FUND_ACCOUNT,
        payment,
        { kind: "CapitalShare" },
        world.households,
        world.capitalShare,
        world.agents.length,
        "producer_equity_sale",
        agentDividends,
      );
      state.publicBookCents += sold;
      if (state.publicBookCents > book) state.publicBookCents = book;
    }
    state.publicShare = book > 0 ? state.publicBookCents / book : 0;
  }

  moved += payFundBalanceAsEqualDividend(ledger, world, agentDividends);
  return moved;
}
