import town from "../../data/towns/lindsborg-ks.json" with { type: "json" };
import m2aEconomy from "../../config/m2a-economy.json" with { type: "json" };
import { readNumber } from "./sourced.js";

export type TownData = typeof town;

export function getTown(): TownData {
  return town;
}

export function scaledAgentCount(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.population) / scale);
}

export function scaledHouseholdCount(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.households) / scale);
}

export function scaledEmployedCount(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.employed) / scale);
}

export function scaledUnemployedCount(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.unemployed) / scale);
}

export function scaledLaborForceCount(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.labor_force) / scale);
}

export function scaledOwnerHouseholds(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.owner_occupied_households) / scale);
}

export function scaledRenterHouseholds(): number {
  const scale = readNumber(town.scale_persons_per_agent);
  return Math.round(readNumber(town.renter_occupied_households) / scale);
}

export function industryAgentSlots(): number[] {
  const scale = readNumber(town.scale_persons_per_agent);
  const raw = town.industry_employment_c24030.map((row) =>
    readNumber(row.count) / scale,
  );
  const target = scaledEmployedCount();
  const floors = raw.map((r) => Math.floor(r));
  let remainder = target - floors.reduce((s, v) => s + v, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    floors[order[k % order.length].i] += 1;
  }
  return floors;
}

export function m2aConfig() {
  return m2aEconomy;
}
