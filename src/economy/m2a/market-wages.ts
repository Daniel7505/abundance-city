import { getTown } from "../../town/lindsborg.js";
import type { M2aWorld } from "../../sim/m2a/types.js";
import { taskAutomatabilityScore } from "./labor.js";

/**
 * Cut a quantity-path firm's wage bill down to today's human-variant receipts.
 *
 * Households on that path spend the whole cash surplus, so those receipts are
 * the wage fund. A shortfall is closed here instead of by a transfer from the
 * producer. Jobs drop most-automatable first, the same order automation
 * already uses. A gap smaller than the next job cuts that worker's wage.
 * Demand-slot wages are the producer's bill and are left alone.
 */
export function fitHumanPayrollToReceipts(
  world: M2aWorld,
  industryIndex: number,
  humanReceiptsCents: number,
): void {
  const town = getTown();
  const workers = world.agents
    .filter(
      (a) =>
        a.laborStatus === "employed" &&
        a.industryIndex === industryIndex &&
        !a.demandSlotEmployment,
    )
    .sort(
      (a, b) =>
        taskAutomatabilityScore(b, industryIndex, town) -
          taskAutomatabilityScore(a, industryIndex, town) || a.id - b.id,
    );

  let payroll = 0;
  for (const worker of workers) payroll += worker.dailyWageCents;
  const ceiling = Math.max(0, humanReceiptsCents);

  for (const worker of workers) {
    if (payroll <= ceiling) return;
    const over = payroll - ceiling;
    if (worker.dailyWageCents > over) {
      worker.dailyWageCents -= over;
      return;
    }
    payroll -= worker.dailyWageCents;
    worker.laborStatus = "unemployed";
    worker.industryIndex = null;
    worker.demandSlotEmployment = false;
    const m2b = world.m2b;
    if (m2b) {
      m2b.separationsToday += 1;
      m2b.separationsCumulative += 1;
    }
  }
}
