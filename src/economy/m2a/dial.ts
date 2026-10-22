export function clampAbundance(a: number): number {
  if (a < 0 || a > 1) throw new Error(`Abundance must be in [0,1], got ${a}`);
  return a;
}

export function humanLaborShare(a: number): number {
  clampAbundance(a);
  return 1 - a;
}

export function automatedLaborShare(a: number): number {
  return a;
}
