import m2aEconomy from "../../../config/m2a-economy.json" with { type: "json" };
import { distributePoolByPolicy } from "./distribute.js";
import type { DividendPolicy } from "./policy.js";
import { TREASURY_ACCOUNT, firmAccount } from "./accounts.js";
import { industryPricesCents, industryUnitCostsCents } from "./prices.js";
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

export function settleFirmPayroll(
  ledger: Ledger,
  world: M2aWorld,
  abundance: number,
  firmRevenue: number[],
  ownershipPolicy: DividendPolicy,
  wagePaidByAgent: Map<number, number>,
  agentDividends: Map<number, number>,
): FirmPayrollResult {
  const industryCount = firmRevenue.length;
  const costs = industryUnitCostsCents(world, abundance);
  const prices = industryPricesCents(world, abundance);
  const markup = m2aEconomy.firmMarkup;
  const wagesPaidByIndustry = Array.from({ length: industryCount }, () => 0);

  let payrollTargetCents = 0;
  let wagesPaidCents = 0;
  let totalLaborHours = 0;
  let ownershipDistributedCents = 0;
  const laborHoursByIndustry = Array.from({ length: industryCount }, () => 0);

  for (let ind = 0; ind < industryCount; ind++) {
    const revenue = firmRevenue[ind];
    const fullNonLabor =
      costs.materials[ind] + costs.energy[ind] + costs.capital[ind];
    const capacityRevenue = prices[ind] * costs.units[ind];
    const activityScale =
      capacityRevenue > 0 ? revenue / capacityRevenue : 0;
    const nonLabor = Math.round(fullNonLabor * activityScale);
    const markupCents = revenue > 0 ? Math.floor(revenue * markup) : 0;
    if (nonLabor > 0) {
      ledger.transferUpTo(
        firmAccount(ind),
        TREASURY_ACCOUNT,
        nonLabor,
        "firm_operating_cost",
      );
    }

    const workers: WageWorker[] = [];
    for (const a of world.agents) {
      if (
        a.laborStatus === "employed" &&
        a.industryIndex === ind &&
        !a.demandSlotEmployment
      ) {
        workers.push({ id: a.id, industryIndex: ind, targetCents: a.dailyWageCents });
        payrollTargetCents += a.dailyWageCents;
      }
    }

    const wagePool = Math.max(0, revenue - nonLabor - markupCents);
    const paid = payWagePoolProRata(
      ledger,
      firmAccount(ind),
      workers,
      wagePool,
      "wage",
      wagePaidByAgent,
    );
    wagesPaidByIndustry[ind] = paid;
    wagesPaidCents += paid;

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
