/** Grid dimensions (M0). */
export const MAP_SIZE = 32;

/** Number of commuting citizens. */
export const CITIZEN_COUNT = 100;

/** Simulation ticks spent at work before returning home. */
export const WORK_DWELL_TICKS = 40;

/** Cells moved per simulation tick (constant speed). */
export const CELLS_PER_TICK = 1;

/**
 * Energy model (placeholder constants from robot locomotion project):
 * incremental Wh per step ≈ a·Δd + b·Δd·v² + c·Δt
 * where v is speed in cells/tick and Δt is 1 tick.
 */
export const ENERGY_COEFFICIENTS = {
  /** Wh per cell (linear rolling resistance). */
  a: 0.05,
  /** Wh·tick² per cell (dynamic / velocity-squared term). */
  b: 0.02,
  /** Wh per tick (idle / basal draw while moving or dwelling). */
  c: 0.001,
} as const;

/** Home cells: northwest residential band. */
export const HOME_REGION = { x0: 1, y0: 1, x1: 10, y1: 10 };

/** Work cells: southeast commercial band. */
export const WORK_REGION = { x0: 20, y0: 20, x1: 30, y1: 30 };
