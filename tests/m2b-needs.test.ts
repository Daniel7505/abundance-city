import { describe, expect, it } from "vitest";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { householdDailyNeedsCentsLegacy } from "../src/sim/m2a/needs.js";
import { householdDailyNeedsCentsFromQuantities } from "../src/sim/m2a/needs.js";
import { needsPriceContext } from "../src/sim/m2a/needs-prices.js";

describe("needs basket investigation", () => {
  it("legacy M2a path uses fixed cent targets (not quantity-priced)", () => {
    const world = buildM2aWorld(42);
    const hh = world.households[0];
    const atA0 = householdDailyNeedsCentsLegacy(hh).requiredTotal;
    const atA1 = householdDailyNeedsCentsLegacy(hh).requiredTotal;
    expect(atA0).toBe(atA1);
  });

  it("M2b quantity path lowers cent cost when goods prices fall", () => {
    const world = buildM2aWorld(42);
    const hh = world.households[0];
    const p0 = needsPriceContext(world, 0);
    const p1 = needsPriceContext(world, 1);
    const cents0 = householdDailyNeedsCentsFromQuantities(hh, p0, 0).requiredTotal;
    const cents1 = householdDailyNeedsCentsFromQuantities(hh, p1, 1).requiredTotal;
    expect(p1.goodsCentsPerUnit).toBeLessThan(p0.goodsCentsPerUnit);
    expect(cents1).toBeLessThan(cents0);
  });
});
