import {
  CITIZEN_COUNT,
  HOME_REGION,
  MAP_SIZE,
  WORK_REGION,
} from "./config.js";
import type { SeededPrng } from "./prng.js";

export interface Cell {
  x: number;
  y: number;
}

export type CellKind = "empty" | "home" | "work";

export function cellKind(x: number, y: number): CellKind {
  if (inRegion(x, y, HOME_REGION)) return "home";
  if (inRegion(x, y, WORK_REGION)) return "work";
  return "empty";
}

function inRegion(
  x: number,
  y: number,
  r: { x0: number; y0: number; x1: number; y1: number },
): boolean {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

/** Manhattan path: x-first if citizen id is even, else y-first. */
export function buildCommutePath(home: Cell, work: Cell, citizenId: number): Cell[] {
  const path: Cell[] = [{ x: home.x, y: home.y }];
  let x = home.x;
  let y = home.y;
  const xFirst = citizenId % 2 === 0;

  const steps: Array<() => void> = xFirst
    ? [
        () => {
          while (x !== work.x) {
            x += x < work.x ? 1 : -1;
            path.push({ x, y });
          }
        },
        () => {
          while (y !== work.y) {
            y += y < work.y ? 1 : -1;
            path.push({ x, y });
          }
        },
      ]
    : [
        () => {
          while (y !== work.y) {
            y += y < work.y ? 1 : -1;
            path.push({ x, y });
          }
        },
        () => {
          while (x !== work.x) {
            x += x < work.x ? 1 : -1;
            path.push({ x, y });
          }
        },
      ];

  for (const step of steps) step();
  return path;
}

export function reversePath(path: Cell[]): Cell[] {
  const reversed = [...path].reverse();
  return reversed;
}

/** Assign distinct home/work cells deterministically from seed. */
export function assignHomesAndWorks(prng: SeededPrng): {
  homes: Cell[];
  works: Cell[];
} {
  const homeCandidates = enumerateRegion(HOME_REGION);
  const workCandidates = enumerateRegion(WORK_REGION);
  shuffleInPlace(homeCandidates, prng);
  shuffleInPlace(workCandidates, prng);

  const homes: Cell[] = [];
  const works: Cell[] = [];
  for (let i = 0; i < CITIZEN_COUNT; i++) {
    homes.push(homeCandidates[i % homeCandidates.length]);
    works.push(workCandidates[i % workCandidates.length]);
  }
  return { homes, works };
}

function enumerateRegion(r: {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}): Cell[] {
  const cells: Cell[] = [];
  for (let y = r.y0; y <= r.y1; y++) {
    for (let x = r.x0; x <= r.x1; x++) {
      if (x >= 0 && x < MAP_SIZE && y >= 0 && y < MAP_SIZE) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

function shuffleInPlace<T>(arr: T[], prng: SeededPrng): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = prng.nextInt(0, i);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
