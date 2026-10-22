import economy from "../../config/economy.json" with { type: "json" };
import coefficients from "../../data/coefficients.json" with { type: "json" };
import {
  LANDLORD_ACCOUNT,
  PRODUCER_ACCOUNT,
  TREASURY_ACCOUNT,
  citizenAccount,
  workplaceAccount,
} from "./accounts.js";
import { goodsPriceCents, jobSlotsForAbundance, outputShares } from "./dial.js";
import type { JobAssignment } from "./jobs.js";
import type { Ledger } from "./ledger.js";

export interface DailySettlementResult {
  day: number;
  tick: number;
  priceCents: number;
  jobs: number;
  employed: number;
  unmetNeedCents: number;
  goodsUnitsPurchased: number;
  humanEnergyWh: number;
  automatedEnergyWh: number;
  totalEnergyWh: number;
  costPerPersonCents: number;
  dividendPerCitizenCents: number;
}

export function settleDay(
  ledger: Ledger,
  abundance: number,
  assignments: JobAssignment[],
  dayIndex: number,
  tick: number,
): DailySettlementResult {
  const price = goodsPriceCents(abundance);
  const q = economy.goodsQuantityPerCitizen;
  const goodsCostPerCitizen = price * q;
  const { human: humanShare, automated: autoShare } = outputShares(abundance);

  let unmetNeedCents = 0;
  let goodsUnitsPurchased = 0;

  // Wages
  for (let id = 0; id < economy.citizenCount; id++) {
    const job = assignments[id];
    if (!job.employed || job.workplaceId === null) continue;
    const wp = workplaceAccount(job.workplaceId);
    const wage = Math.min(economy.wageCents, ledger.getBalance(wp));
    if (wage < economy.wageCents) {
      unmetNeedCents += economy.wageCents - wage;
    }
    if (wage > 0) {
      ledger.transfer(wp, citizenAccount(id), wage, "wage");
    }
  }

  // Rent
  for (let id = 0; id < economy.citizenCount; id++) {
    const paid = ledger.transferUpTo(
      citizenAccount(id),
      LANDLORD_ACCOUNT,
      economy.rentCents,
      "rent",
    );
    if (paid < economy.rentCents) {
      unmetNeedCents += economy.rentCents - paid;
    }
  }

  // Goods purchases (partial allowed)
  for (let id = 0; id < economy.citizenCount; id++) {
    const target = goodsCostPerCitizen;
    const paid = ledger.transferUpTo(
      citizenAccount(id),
      TREASURY_ACCOUNT,
      target,
      "goods_payment_staging",
    );
    if (paid < target) {
      unmetNeedCents += target - paid;
    }
    if (paid <= 0) continue;

    const unitsPaid = price > 0 ? paid / price : 0;
    goodsUnitsPurchased += unitsPaid;

    const toHuman = Math.round(paid * humanShare);
    const toAuto = paid - toHuman;

    if (toHuman > 0) {
      const perWp = Math.floor(toHuman / economy.workplaceCount);
      let remainder = toHuman - perWp * economy.workplaceCount;
      for (let wp = 0; wp < economy.workplaceCount; wp++) {
        let share = perWp;
        if (remainder > 0) {
          share += 1;
          remainder -= 1;
        }
        if (share > 0) {
          ledger.transfer(
            TREASURY_ACCOUNT,
            workplaceAccount(wp),
            share,
            "goods_revenue_human",
          );
        }
      }
    }
    if (toAuto > 0) {
      ledger.transfer(
        TREASURY_ACCOUNT,
        PRODUCER_ACCOUNT,
        toAuto,
        "goods_revenue_automated",
      );
    }
  }

  // Workplace profit -> treasury
  for (let wp = 0; wp < economy.workplaceCount; wp++) {
    const acct = workplaceAccount(wp);
    const bal = ledger.getBalance(acct);
    if (bal > 0) {
      ledger.transfer(acct, TREASURY_ACCOUNT, bal, "workplace_profit");
    }
  }

  // Landlord rent -> treasury
  const landlordBal = ledger.getBalance(LANDLORD_ACCOUNT);
  if (landlordBal > 0) {
    ledger.transfer(LANDLORD_ACCOUNT, TREASURY_ACCOUNT, landlordBal, "rent_to_treasury");
  }

  // Automated producer profit -> treasury
  const producerBal = ledger.getBalance(PRODUCER_ACCOUNT);
  if (producerBal > 0) {
    ledger.transfer(PRODUCER_ACCOUNT, TREASURY_ACCOUNT, producerBal, "producer_profit");
  }

  // Treasury dividend (equal split; remainder stays)
  const treasuryBal = ledger.getBalance(TREASURY_ACCOUNT);
  const dividendPer = Math.floor(treasuryBal / economy.citizenCount);
  const totalDividend = dividendPer * economy.citizenCount;
  if (totalDividend > 0) {
    for (let id = 0; id < economy.citizenCount; id++) {
      ledger.transfer(
        TREASURY_ACCOUNT,
        citizenAccount(id),
        dividendPer,
        "dividend",
      );
    }
  }

  const humanEnergyWh =
    goodsUnitsPurchased * humanShare * coefficients.energyWhPerGoodsUnit.human;
  const automatedEnergyWh =
    goodsUnitsPurchased * autoShare * coefficients.energyWhPerGoodsUnit.automated;
  const totalEnergyWh = humanEnergyWh + automatedEnergyWh;

  const costPerPersonCents = economy.rentCents + goodsCostPerCitizen;

  return {
    day: dayIndex,
    tick,
    priceCents: price,
    jobs: jobSlotsForAbundance(abundance),
    employed: assignments.filter((a) => a.employed).length,
    unmetNeedCents,
    goodsUnitsPurchased,
    humanEnergyWh,
    automatedEnergyWh,
    totalEnergyWh,
    costPerPersonCents,
    dividendPerCitizenCents: dividendPer,
  };
}
