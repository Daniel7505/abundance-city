import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { automatedLaborShare } from "./dial.js";
import { distributePoolByPolicy } from "./distribute.js";
import type { DividendPolicy } from "./policy.js";
import {
  FIRM_PAYROLL_FLOAT_DAYS,
  TREASURY_ACCOUNT,
  agentAccount,
  firmAccount,
} from "./accounts.js";
import { laborHoursFromPaid, payWagePoolProRata, type WageWorker } from "./wage-pool.js";
import type { Ledger } from "../ledger.js";
import type { M2aWorld } from "../../sim/m2a/types.js";

export interface FirmPayrollResult {
  payrollTargetCents: number;
  wagesPaidCents: number;
  totalLaborHours: number;
  wagesPaidByIndustry: number[];
  laborHoursByIndustry: number[];
  ownershipDistributedCents: number;
}

function settleFirmPayrollNoAutomation(
  ledger: Ledger,
  world: M2aWorld,
  firmRevenue: number[],
  ownershipPolicy: DividendPolicy,
  wagePaidByAgent: Map<number, number>,
  agentDividends: Map<number, number>,
): FirmPayrollResult {
  const industryCount = firmRevenue.length;
  const markup = m2aEconomy.firmMarkup;
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

  for (let ind = 0; ind < industryCount; ind++) {
    const balance = ledger.getBalance(firmAccount(ind));
    const floatTarget = payrollByIndustry[ind] * FIRM_PAYROLL_FLOAT_DAYS;
    const excess = balance - floatTarget;
    if (excess > 0) {
      ledger.transfer(firmAccount(ind), TREASURY_ACCOUNT, excess, "firm_payroll_rebalance");
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
    const markupCents = revenue > 0 ? Math.floor(revenue * markup) : 0;
    const markupPool = Math.min(markupCents, ledger.getBalance(firmAccount(ind)));
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
    const floatTarget = payrollByIndustry[ind] * FIRM_PAYROLL_FLOAT_DAYS;
    const residual = ledger.getBalance(firmAccount(ind)) - floatTarget;
    if (residual > 0) {
      ledger.transfer(firmAccount(ind), TREASURY_ACCOUNT, residual, "firm_residual_sweep");
    }
  }

  return {
    payrollTargetCents,
    wagesPaidCents,
    totalLaborHours,
    wagesPaidByIndustry,
    laborHoursByIndustry,
    ownershipDistributedCents,
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
): FirmPayrollResult {
  if (automatedLaborShare(abundance) === 0) {
    return settleFirmPayrollNoAutomation(
      ledger,
      world,
      firmRevenue,
      ownershipPolicy,
      wagePaidByAgent,
      agentDividends,
    );
  }

  const industryCount = firmRevenue.length;
  const markup = m2aEconomy.firmMarkup;
  const wagesPaidByIndustry = Array.from({ length: industryCount }, () => 0);

  let payrollTargetCents = 0;
  let wagesPaidCents = 0;
  let totalLaborHours = 0;
  let ownershipDistributedCents = 0;
  const laborHoursByIndustry = Array.from({ length: industryCount }, () => 0);

  for (let ind = 0; ind < industryCount; ind++) {
    const revenue = firmRevenue[ind];
    const markupCents = revenue > 0 ? Math.floor(revenue * markup) : 0;
    const costPortion = Math.max(0, revenue - markupCents);

    const workers: WageWorker[] = [];
    let industryPayrollTarget = 0;
    for (const a of world.agents) {
      if (
        a.laborStatus === "employed" &&
        a.industryIndex === ind &&
        !a.demandSlotEmployment
      ) {
        workers.push({ id: a.id, industryIndex: ind, targetCents: a.dailyWageCents });
        industryPayrollTarget += a.dailyWageCents;
        payrollTargetCents += a.dailyWageCents;
      }
    }

    const wagePool = Math.min(industryPayrollTarget, costPortion);
    const paid = payWagePoolProRata(
      ledger,
      firmAccount(ind),
      workers,
      wagePool,
      "wage",
      wagePaidByAgent,
      world.agents,
    );
    wagesPaidByIndustry[ind] = paid;
    wagesPaidCents += paid;

    const nonLabor = Math.max(0, costPortion - wagePool);
    if (nonLabor > 0) {
      ledger.transferUpTo(
        firmAccount(ind),
        TREASURY_ACCOUNT,
        nonLabor,
        "firm_operating_cost",
      );
    }

    let indHours = 0;
    for (const w of workers) {
      const h = laborHoursFromPaid(w.targetCents, wagePaidByAgent.get(w.id) ?? 0);
      indHours += h;
      totalLaborHours += h;
    }
    laborHoursByIndustry[ind] = indHours;

    const markupPool = Math.min(markupCents, ledger.getBalance(firmAccount(ind)));
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

    const residual = ledger.getBalance(firmAccount(ind));
    if (residual > 0) {
      ledger.transfer(firmAccount(ind), TREASURY_ACCOUNT, residual, "firm_residual_sweep");
    }
  }

  return {
    payrollTargetCents,
    wagesPaidCents,
    totalLaborHours,
    wagesPaidByIndustry,
    laborHoursByIndustry,
    ownershipDistributedCents,
  };
}
