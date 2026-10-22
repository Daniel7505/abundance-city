import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { collectSourcedNumericFields } from "../src/town/sourced.js";

describe("town data provenance", () => {
  it("every numeric sourced field in lindsborg-ks.json has source_url", () => {
    const raw = readFileSync("data/towns/lindsborg-ks.json", "utf8");
    const json = JSON.parse(raw) as unknown;
    const fields = collectSourcedNumericFields(json);
    expect(fields.length).toBeGreaterThan(0);
    for (const f of fields) {
      expect(f.source_url.length).toBeGreaterThan(0);
    }
  });
});
