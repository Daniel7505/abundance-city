import coefficients from "../../../data/coefficients.json" with { type: "json" };

export type AutomationPathMode = "fixed" | "linear" | "logistic";

export interface AutomationPathOverrides {
  mode?: AutomationPathMode | string;
  horizonDays?: number;
  startLevel?: number;
  endLevel?: number;
  midpointDay?: number;
  steepness?: number;
}

export type AutomationPathOption = AutomationPathMode | AutomationPathOverrides;

export interface ResolvedAutomationPath {
  mode: AutomationPathMode;
  /** Fixed-mode level. Equal to the run's abundance scalar. Schedules do not read it. */
  level: number;
  horizonDays: number;
  startLevel: number;
  endLevel: number;
  midpointDay: number;
  steepness: number;
}

interface AutomationPathCoefficients {
  defaultMode?: string;
  horizonDays: number;
  startLevel: number;
  endLevel: number;
  logisticMidpointDay: number;
  logisticSteepness: number;
}

function pathCoefficients(): AutomationPathCoefficients {
  return coefficients.automationPath as AutomationPathCoefficients;
}

export function parseAutomationPathMode(name: string | undefined): AutomationPathMode {
  if (name === undefined || name === "") return "fixed";
  if (name === "fixed" || name === "linear" || name === "logistic") return name;
  throw new Error(`Unknown automation path: ${name}`);
}

export function resolveAutomationPath(
  abundance: number,
  option?: AutomationPathOption,
): ResolvedAutomationPath {
  const defaults = pathCoefficients();
  let mode = parseAutomationPathMode(defaults.defaultMode);
  let horizonDays = defaults.horizonDays;
  let startLevel = defaults.startLevel;
  let endLevel = defaults.endLevel;
  let midpointDay = defaults.logisticMidpointDay;
  let steepness = defaults.logisticSteepness;

  if (typeof option === "string") {
    mode = parseAutomationPathMode(option);
  } else if (option) {
    if (option.mode !== undefined) mode = parseAutomationPathMode(option.mode);
    if (option.horizonDays !== undefined) horizonDays = option.horizonDays;
    if (option.startLevel !== undefined) startLevel = option.startLevel;
    if (option.endLevel !== undefined) endLevel = option.endLevel;
    if (option.midpointDay !== undefined) midpointDay = option.midpointDay;
    if (option.steepness !== undefined) steepness = option.steepness;
  }

  if (!Number.isInteger(horizonDays) || horizonDays < 1) {
    throw new Error(`automation horizonDays must be a positive integer, got ${horizonDays}`);
  }
  if (
    !Number.isFinite(abundance) ||
    !Number.isFinite(startLevel) ||
    !Number.isFinite(endLevel) ||
    !Number.isFinite(midpointDay) ||
    !Number.isFinite(steepness)
  ) {
    throw new Error("automation path parameters must be finite");
  }

  return {
    mode,
    level: abundance,
    horizonDays,
    startLevel,
    endLevel,
    midpointDay,
    steepness,
  };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

/** Automation level on dayIndex. fixed returns the run abundance exactly. */
export function automationLevelAtDay(path: ResolvedAutomationPath, dayIndex: number): number {
  if (path.mode === "fixed") return path.level;
  const start = path.startLevel;
  const span = path.endLevel - start;
  if (path.mode === "linear") {
    if (path.horizonDays <= 1) return clamp01(path.endLevel);
    const u = Math.min(1, Math.max(0, dayIndex / (path.horizonDays - 1)));
    return clamp01(start + span * u);
  }
  const z = path.steepness * (dayIndex - path.midpointDay);
  const zz = z < -60 ? -60 : z > 60 ? 60 : z;
  const sigmoid = 1 / (1 + Math.exp(-zz));
  return clamp01(start + span * sigmoid);
}
