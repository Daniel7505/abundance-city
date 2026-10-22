import { M1_WORK_DWELL_TICKS } from "./config.js";
import type { Cell } from "../grid.js";
import { buildCommutePath, reversePath } from "../grid.js";
import { energyDeltaWh } from "../energy.js";
import type { Citizen } from "../citizen.js";

export function createM1Citizen(
  id: number,
  home: Cell,
  work: Cell,
): Citizen {
  const pathToWork = buildCommutePath(home, work, id);
  const pathToHome = reversePath(pathToWork);
  return {
    id,
    home,
    work,
    x: home.x,
    y: home.y,
    phase: "to_work",
    pathToWork,
    pathToHome,
    pathIndex: 0,
    dwellTicksRemaining: 0,
    cumulativeWh: 0,
  };
}

export function setCitizenWorkplace(c: Citizen, work: Cell): void {
  c.work = work;
  c.pathToWork = buildCommutePath(c.home, work, c.id);
  c.pathToHome = reversePath(c.pathToWork);
  c.pathIndex = 0;
  c.phase = "to_work";
  c.dwellTicksRemaining = 0;
}

export function stepM1Citizen(c: Citizen): void {
  let distanceCells = 0;
  let moving = false;

  switch (c.phase) {
    case "to_work": {
      const nextIndex = c.pathIndex + 1;
      if (nextIndex < c.pathToWork.length) {
        const next = c.pathToWork[nextIndex];
        distanceCells = Math.abs(next.x - c.x) + Math.abs(next.y - c.y);
        c.x = next.x;
        c.y = next.y;
        c.pathIndex = nextIndex;
        moving = distanceCells > 0;
      } else {
        c.phase = "at_work";
        c.dwellTicksRemaining = M1_WORK_DWELL_TICKS;
        c.pathIndex = 0;
      }
      break;
    }
    case "at_work": {
      c.dwellTicksRemaining -= 1;
      if (c.dwellTicksRemaining <= 0) {
        c.phase = "to_home";
        c.pathIndex = 0;
      }
      break;
    }
    case "to_home": {
      const nextIndex = c.pathIndex + 1;
      if (nextIndex < c.pathToHome.length) {
        const next = c.pathToHome[nextIndex];
        distanceCells = Math.abs(next.x - c.x) + Math.abs(next.y - c.y);
        c.x = next.x;
        c.y = next.y;
        c.pathIndex = nextIndex;
        moving = distanceCells > 0;
      } else {
        c.phase = "at_home";
        c.pathIndex = 0;
      }
      break;
    }
    case "at_home": {
      c.phase = "to_work";
      c.pathIndex = 0;
      break;
    }
  }

  c.cumulativeWh += energyDeltaWh(distanceCells, moving);
}
