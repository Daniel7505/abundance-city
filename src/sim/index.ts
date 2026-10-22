export { MAP_SIZE, CITIZEN_COUNT, HOME_REGION, WORK_REGION } from "./config.js";
export { SeededPrng } from "./prng.js";
export { runSimulation, createSimulation, SimRunner } from "./engine.js";
export type { SimOptions, SimSnapshot } from "./engine.js";
export type { AgentTickLog, RunSummary, SimRunResult } from "./types.js";
export { cellKind } from "./grid.js";
