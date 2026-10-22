export type DividendPolicy =
  | { kind: "EqualDividend" }
  | { kind: "CapitalShare" }
  | { kind: "TaxAndDividend" }
  | { kind: "Mix"; w: number };

export function parseDividendPolicy(
  name: string,
  mixWeight = 0.5,
): DividendPolicy {
  switch (name) {
    case "EqualDividend":
      return { kind: "EqualDividend" };
    case "CapitalShare":
      return { kind: "CapitalShare" };
    case "TaxAndDividend":
      return { kind: "TaxAndDividend" };
    case "Mix":
      return { kind: "Mix", w: mixWeight };
    default:
      throw new Error(`Unknown dividend policy: ${name}`);
  }
}

export function policyLabel(policy: DividendPolicy): string {
  if (policy.kind === "Mix") return `Mix(${policy.w})`;
  return policy.kind;
}
