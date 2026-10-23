import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { distributePoolByPolicy } from "./distribute.js";
import { fitHumanPayrollToReceipts } from "./market-wages.js";
import type { DividendPolicy } from "./policy.js";
import type { WagePolicyName } from "./wage-policy.js";
import {
  FIRM_PAYROLL_FLOAT_DAYS,
  TREASURY_ACCOUNT,
  agentAccount,
  firmAccount,
} from "./accounts.js";
import { laborHoursFromPaid, type WageWorker } from "./wage-pool.js";
import type { Ledger } from "../ledger.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

export interface FirmPayrollResult {
  payrollTargetCents: number;
  wagesPaidCents: number;
  totalLaborHours: number;
  wagesPaidByIndustry: number[];
  laborHoursByIndustry: number[];
  ownershipDistributedCents: number;
  /** Cash above the payroll float after wages and markup. Returned to payers. */
  residualRebateCents: number;
}

function settleFirmPayrollNoAutomation(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  firmRevenue: number[],
  ownershipPolicy: DividendPolicy,
  wagePaidByAgent: Map<number, number>,
  agentDividends: Map<number, number>,
  wagePolicy: WagePolicyName,
  coverUncoveredBill: boolean,
): FirmPayrollResult {
  const industryCount = firmRevenue.length;
  const markup = m2aEconomy.firmMarkup;

  // Quantity-path MarketWages shrinks the bill to human-variant receipts
  // before anyone is paid. WageGuarantee leaves the staff in place.
  if (wagePolicy === "MarketWages" && coverUncoveredBill) {
    for (let ind = 0; ind < industryCount; ind++) {
      fitHumanPayrollToReceipts(world, ind, firmRevenue[ind] ?? 0);
    }
  }

  const payrollByIndustry = Array.from({ length: industryCount }, () => 0);
  const workersByIndustry: WageWorker[][] = Array.from({ length: industryCount }, () => []);

  for (const a of world.agents) {
    if (a.laborStatus === "employed" && a.industryIndex !== null && !a.demandSlotEmployment) {
      payrollByIndustry[a.industryIndex] += a.dailyWageCents;
      workersByIndustry[a.industryIndex].push({
        id: a.id,
        industryIndex: a.industryIndex,
        targetCents: a.dailyWageCents,
      });
    }
  }

  const payrollTargetCents = payrollByIndustry.reduce((s, n) => s + n, 0);

  // The legacy 0.9 path does not satisfy the receipts identity, so its excess
  // float is still swept to the treasury and a short firm is topped up from
  // that pool. The quantity path leaves receipts in the firm until wages and
  // markup are paid; MarketWages has already fitted the bill to those receipts.
  if (!coverUncoveredBill) {
    for (let ind = 0; ind < industryCount; ind++) {
      const balance = ledger.getBalance(firmAccount(ind));
      const floatTarget = payrollByIndustry[ind] * FIRM_PAYROLL_FLOAT_DAYS;
      const excess = balance - floatTarget;
      if (excess > 0) {
        ledger.transfer(firmAccount(ind), TREASURY_ACCOUNT, excess, "firm_payroll_rebalance");
      }
    }
  }
  for (let ind = 0; ind < industryCount; ind++) {
    const balance = ledger.getBalance(firmAccount(ind));
    const shortfall = payrollByIndustry[ind] - balance;
    if (shortfall > 0) {
      ledger.transferUpTo(TREASURY_ACCOUNT, firmAccount(ind), shortfall, "firm_payroll_rebalance");
    }
  }

  const wagesPaidByIndustry = Array.from({ length: industryCount }, () => 0);
  let wagesPaidCents = 0;
  let totalLaborHours = 0;
  let ownershipDistributedCents = 0;
  let residualRebateCents = 0;
  const laborHoursByIndustry = Array.from({ length: industryCount }, () => 0);

  for (let ind = 0; ind < industryCount; ind++) {
    for (const w of workersByIndustry[ind]) {
      const paid = ledger.transferUpTo(
        firmAccount(ind),
        agentAccount(w.id),
        w.targetCents,
        "wage",
      );
      wagesPaidByIndustry[ind] += paid;
      wagesPaidCents += paid;
      wagePaidByAgent.set(w.id, paid);
      const hours = laborHoursFromPaid(w.targetCents, paid);
      totalLaborHours += hours;
      laborHoursByIndustry[ind] += hours;
    }

    const revenue = firmRevenue[ind];
    const payroll = payrollByIndustry[ind];
    const markupCents = revenue > 0 ? Math.floor(revenue * markup) : 0;
    const floatTarget = payroll * FIRM_PAYROLL_FLOAT_DAYS;
    // Quantity path: profit is cash above the payroll float after wages, at
    // every abundance. The float is working capital, and households spend the
    // markup that is already in the price, so no abundance-0 draw is required.
    // Legacy path: receipts are swept to the float target before wages, so the
    // markup has to come from working capital. At abundance 0 that draw stops
    // at 15 days, which is what keeps the legacy ownership circuit alive.
    // Once any production is automated the legacy draw stops at the float.
    const markupFloor =
      coverUncoveredBill || abundance > 0 ? floatTarget : payroll * 15;
    const markupPool = Math.min(
      markupCents,
      Math.max(0, ledger.getBalance(firmAccount(ind)) - markupFloor),
    );
    if (markupPool > 0) {
      ownershipDistributedCents += distributePoolByPolicy(
        ledger,
        firmAccount(ind),
        markupPool,
        ownershipPolicy,
        world.households,
        world.capitalShare,
        world.agents.length,
        "ownership_income",
        agentDividends,
      );
    }
    const residual = ledger.getBalance(firmAccount(ind)) - floatTarget;
    // Above-float cash is the part of the goods bill that was not wages or
    // markup. It is rebated to payers after producer settlement so it is
    // not counted as ownership income and is not swept into the treasury.
    if (residual > 0) residualRebateCents += residual;
  }

  return {
    payrollTargetCents,
    wagesPaidCents,
    totalLaborHours,
    wagesPaidByIndustry,
    laborHoursByIndustry,
    ownershipDistributedCents,
    residualRebateCents,
  };
}

export function settleFirmPayroll(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  firmRevenue: number[],
  ownershipPolicy: DividendPolicy,
  wagePaidByAgent: Map<number, number>,
  agentDividends: Map<number, number>,
  wagePolicy: WagePolicyName,
  coverUncoveredBill: boolean,
): FirmPayrollResult {
  // Human wages are paid from firm cash at every abundance. Under MarketWages
  // the uncovered quantity-path bill is cut before payment. Under WageGuarantee
  // the producer has already topped receipts up to payroll.
  return settleFirmPayrollNoAutomation(
    ledger,
    world,
    abundance,
    firmRevenue,
    ownershipPolicy,
    wagePaidByAgent,
    agentDividends,
    wagePolicy,
    coverUncoveredBill,
  );
}
