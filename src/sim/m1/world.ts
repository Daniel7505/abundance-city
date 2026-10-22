import economy from "../../../config/economy.json" with { type: "json" };
import { MAP_SIZE } from "../config.js";
import type { Cell } from "../grid.js";
import { SeededPrng } from "../prng.js";

/** Canonical world layout — always derived from seed 42. */
export const WORLD_LAYOUT_SEED = 42;

export interface M1World {
  homes: Cell[];
  workplaces: Cell[];
  producer: Cell;
  citizenHomeIndex: number[];
}

function pickDistinctCells(
  prng: SeededPrng,
  count: number,
  region: { x0: number; y0: number; x1: number; y1: number },
): Cell[] {
  const candidates: Cell[] = [];
  for (let y = region.y0; y <= region.y1; y++) {
    for (let x = region.x0; x <= region.x1; x++) {
      if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
        candidates.push({ x, y });
      }
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = prng.nextInt(0, i);
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  return candidates.slice(0, count);
}

export function buildM1World(): M1World {
  const prng = new SeededPrng(WORLD_LAYOUT_SEED);
  const homes = pickDistinctCells(prng, economy.homesCount, {
    x0: 1,
    y0: 1,
    x1: 12,
    y1: 12,
  });
  const workplaces = pickDistinctCells(prng, economy.workplaceCount, {
    x0: 18,
    y0: 18,
    x1: 30,
    y1: 30,
  });
  const [producer] = pickDistinctCells(prng, 1, {
    x0: 14,
    y0: 14,
    x1: 28,
    y1: 28,
  });

  const citizenHomeIndex: number[] = [];
  for (let c = 0; c < economy.citizenCount; c++) {
    citizenHomeIndex.push(Math.floor(c / economy.citizensPerHome));
  }

  return { homes, workplaces, producer, citizenHomeIndex };
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
