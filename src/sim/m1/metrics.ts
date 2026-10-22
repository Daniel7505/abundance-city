import economy from "../../../config/economy.json" with { type: "json" };
import type { DailySettlementResult } from "../../economy/daily.js";
import { moneySupplyCents } from "../../economy/accounts.js";

export interface DailyMetricLine {
  day: number;
  tick: number;
  /** Fraction of trailing days where daily dividend alone covered rent+goods. */
  workOptionalShare: number;
  costPerPerson: number;
  totalEnergyWh: number;
  humanEnergyWh: number;
  automatedEnergyWh: number;
  jobs: number;
  employed: number;
  price: number;
  moneySupply: number;
  unmetNeed: number;
}

interface TrailingWindow {
  days: Array<{ dividend: number; livingCost: number }>;
}

export class DailyMetricsCollector {
  private window: TrailingWindow = { days: [] };

  record(settlement: DailySettlementResult): DailyMetricLine {
    this.window.days.push({
      dividend: settlement.dividendPerCitizenCents,
      livingCost: settlement.costPerPersonCents,
    });
    const maxLen = economy.trailingDaysForWorkOptional;
    if (this.window.days.length > maxLen) this.window.days.shift();

    const n = this.window.days.length;
    const optionalDays = this.window.days.filter(
      (d) => d.dividend >= d.livingCost,
    ).length;
    const dividendCoversLiving = n > 0 ? optionalDays / n : 0;
    const unemployedShare =
      1 - settlement.employed / economy.citizenCount;
    const workOptionalShare = unemployedShare * dividendCoversLiving;

    return {
      day: settlement.day,
      tick: settlement.tick,
      workOptionalShare,
      costPerPerson: settlement.costPerPersonCents,
      totalEnergyWh: settlement.totalEnergyWh,
      humanEnergyWh: settlement.humanEnergyWh,
      automatedEnergyWh: settlement.automatedEnergyWh,
      jobs: settlement.jobs,
      employed: settlement.employed,
      price: settlement.priceCents,
      moneySupply: moneySupplyCents(),
      unmetNeed: settlement.unmetNeedCents,
    };
  }
}
