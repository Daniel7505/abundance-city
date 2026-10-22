import economy from "../../config/economy.json" with { type: "json" };
import type { Cell } from "../sim/grid.js";
import { manhattan } from "../sim/m1/world.js";
import { workplaceSlotCaps } from "./dial.js";

export interface JobAssignment {
  employed: boolean;
  workplaceId: number | null;
}

export function assignJobs(
  abundance: number,
  homes: Cell[],
  workplaces: Cell[],
  citizenHomeIndex: number[],
): JobAssignment[] {
  const caps = [...workplaceSlotCaps(abundance)];
  const filled = caps.map(() => 0);
  const assignments: JobAssignment[] = Array.from(
    { length: economy.citizenCount },
    () => ({ employed: false, workplaceId: null }),
  );

  for (let citizenId = 0; citizenId < economy.citizenCount; citizenId++) {
    const home = homes[citizenHomeIndex[citizenId]];
    let bestWp: number | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    for (let wp = 0; wp < workplaces.length; wp++) {
      if (filled[wp] >= caps[wp]) continue;
      const dist = manhattan(home, workplaces[wp]);
      if (
        dist < bestDist ||
        (dist === bestDist && (bestWp === null || wp < bestWp))
      ) {
        bestDist = dist;
        bestWp = wp;
      }
    }

    if (bestWp !== null) {
      filled[bestWp] += 1;
      assignments[citizenId] = { employed: true, workplaceId: bestWp };
    }
  }

  return assignments;
}

export function countEmployed(assignments: JobAssignment[]): number {
  return assignments.filter((a) => a.employed).length;
}
