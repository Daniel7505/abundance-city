import { CELLS_PER_TICK, ENERGY_COEFFICIENTS } from "./config.js";

const { a, b, c } = ENERGY_COEFFICIENTS;

/**
 * Incremental energy (Wh) for one tick of movement over `distanceCells`.
 * v is constant CELLS_PER_TICK when moving; 0 when dwelling.
 */
export function energyDeltaWh(distanceCells: number, moving: boolean): number {
  const v = moving ? CELLS_PER_TICK : 0;
  const deltaT = 1;
  const deltaD = distanceCells;
  const dynamic = b * deltaD * v * v;
  const linear = a * deltaD;
  const timeCost = c * deltaT;
  return linear + dynamic + timeCost;
}
