/**
 * M2b circular-flow diagnostic: 30-day average inter-class transfers and month-end balances.
 *
 * Usage: npx tsx scripts/circular-flow-diagnostic.ts
 * Options: --seed=42 --days=365 --abundance=0,0.5,1 --policy=Mix --window=30
 */
import m2aEconomy from "../config/m2a-economy.json" with { type: "json" };
import m2bEconomy from "../config/m2b-economy.json" with { type: "json" };
import {
  allM2aAccountIds,
  createM2aInitialBalances,
  LANDLORD_ACCOUNT,
  PRODUCER_ACCOUNT,
  TREASURY_ACCOUNT,
  firmAccount,
  m2aMoneySupplyCents,
  type AccountId,
} from "../src/economy/m2a/accounts.js";
import { HouseholdConsumptionState } from "../src/economy/m2a/consumption.js";
import { settleM2aDay } from "../src/economy/m2a/daily.js";
import { basketPriceIndex, industryPricesCents } from "../src/economy/m2a/prices.js";
import {
  applyM2bLaborForDay,
  countDisplacedM2b,
  initM2bLaborState,
} from "../src/economy/m2b/labor.js";
import { parseDividendPolicy } from "../src/economy/m2a/policy.js";
import { automatedLaborShare } from "../src/economy/m2a/dial.js";
import { Ledger, type TransferRecord } from "../src/economy/ledger.js";
import { buildM2aWorld } from "../src/sim/m2a/worldgen.js";
import { M2aMetricsCollector } from "../src/sim/m2a/metrics.js";

type NodeId = "households" | "producer" | "landlord" | "treasury" | `firm:${number}`;
type AggNode = "households" | "firms" | "producer" | "landlord" | "treasury";

function aggregateNode(n: NodeId): AggNode {
  if (n.startsWith("firm:")) return "firms";
  return n;
}

function aggregateFlows(flows: Map<string, number>): Map<string, number> {
  const agg = new Map<string, number>();
  for (const [k, cents] of flows) {
    const [from, to] = k.split("->") as [NodeId, NodeId];
    const key = `${aggregateNode(from)}->${aggregateNode(to)}`;
    agg.set(key, (agg.get(key) ?? 0) + cents);
  }
  return agg;
}

function parseArgs(argv: string[]) {
  const opts = {
    seed: 42,
    days: 365,
    abundances: [0, 0.5, 1] as number[],
    policyName: "Mix",
    mixWeight: 0.5,
    window: 30,
  };
  for (const arg of argv) {
    if (arg.startsWith("--seed=")) opts.seed = Number(arg.slice(7));
    else if (arg.startsWith("--days=")) opts.days = Number(arg.slice(7));
    else if (arg.startsWith("--abundance=")) {
      opts.abundances = arg
        .slice(12)
        .split(",")
        .map((s) => Number(s.trim()));
    } else if (arg.startsWith("--policy=")) opts.policyName = arg.slice(9);
    else if (arg.startsWith("--window=")) opts.window = Number(arg.slice(9));
  }
  return opts;
}

function classifyAccount(id: AccountId, firmCount: number): NodeId {
  if (id === PRODUCER_ACCOUNT) return "producer";
  if (id === LANDLORD_ACCOUNT) return "landlord";
  if (id === TREASURY_ACCOUNT) return "treasury";
  if (id.startsWith("agent:")) return "households";
  if (id.startsWith("firm:")) {
    const n = Number(id.slice(5));
    if (Number.isInteger(n) && n >= 0 && n < firmCount) return `firm:${n}`;
  }
  return "treasury";
}

function emptyFlowMatrix(nodes: NodeId[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const from of nodes) {
    for (const to of nodes) {
      if (from !== to) m.set(`${from}->${to}`, 0);
    }
  }
  return m;
}

function addFlow(
  matrix: Map<string, number>,
  from: NodeId,
  to: NodeId,
  cents: number,
): void {
  if (from === to || cents === 0) return;
  const key = `${from}->${to}`;
  matrix.set(key, (matrix.get(key) ?? 0) + cents);
}

function flowsFromTransfers(
  transfers: readonly TransferRecord[],
  firmCount: number,
  startIdx: number,
): Map<string, number> {
  const nodes: NodeId[] = [
    "households",
    "producer",
    "landlord",
    "treasury",
    ...Array.from({ length: firmCount }, (_, i) => `firm:${i}` as NodeId),
  ];
  const matrix = emptyFlowMatrix(nodes);
  for (let i = startIdx; i < transfers.length; i++) {
    const t = transfers[i];
    const from = classifyAccount(t.from, firmCount);
    const to = classifyAccount(t.to, firmCount);
    addFlow(matrix, from, to, t.cents);
  }
  return matrix;
}

function aggregateBalances(
  ledger: Ledger,
  firmCount: number,
): Record<NodeId, number> {
  const out: Record<string, number> = {
    households: 0,
    producer: ledger.getBalance(PRODUCER_ACCOUNT),
    landlord: ledger.getBalance(LANDLORD_ACCOUNT),
    treasury: ledger.getBalance(TREASURY_ACCOUNT),
  };
  for (let i = 0; i < firmCount; i++) {
    out[`firm:${i}`] = ledger.getBalance(firmAccount(i));
  }
  let hh = 0;
  for (const id of ledger.snapshotBalances().keys()) {
    if (id.startsWith("agent:")) hh += ledger.getBalance(id);
  }
  out.households = hh;
  return out as Record<NodeId, number>;
}

function reasonTotals(transfers: readonly TransferRecord[], startIdx: number): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = startIdx; i < transfers.length; i++) {
    const t = transfers[i];
    m.set(t.reason, (m.get(t.reason) ?? 0) + t.cents);
  }
  return m;
}

interface DayRecord {
  day: number;
  flows: Map<string, number>;
  balances: Record<NodeId, number>;
  reasons: Map<string, number>;
  gini: number;
  payrollCents: number;
  firmRevenueCentsTotal: number;
  autoShare: number;
}

function runDiagnostic(
  seed: number,
  days: number,
  abundance: number,
  policyName: string,
  mixWeight: number,
): DayRecord[] {
  const world = buildM2aWorld(seed);
  const firmCount = world.industrySlotsBase.length;
  const agentCount = world.agents.length;
  const known = new Set(allM2aAccountIds(agentCount, firmCount));
  const ledger = new Ledger(createM2aInitialBalances(world), {
    knownAccounts: known,
    initialSupplyCents: m2aMoneySupplyCents(world),
  });
  const policy = parseDividendPolicy(policyName, mixWeight);
  const refAbundance = m2bEconomy.referenceAbundanceForDemand;
  const refPrices = industryPricesCents(world, refAbundance);
  const refIndex = basketPriceIndex(world, refAbundance, refPrices);
  initM2bLaborState(world, refIndex);
  applyM2bLaborForDay(
    world,
    abundance,
    0,
    basketPriceIndex(world, abundance, industryPricesCents(world, abundance)),
  );

  const collector = new M2aMetricsCollector({ m2bEnabled: true });
  const consumptionState = new HouseholdConsumptionState(world);
  const records: DayRecord[] = [];
  let transferCursor = 0;
  const totalTicks = days * m2aEconomy.ticksPerDay;

  for (let tick = 0; tick < totalTicks; tick++) {
    if (tick % m2aEconomy.ticksPerDay !== m2aEconomy.settlementTickOfDay) continue;
    const dayIndex = Math.floor(tick / m2aEconomy.ticksPerDay);
    const prices = industryPricesCents(world, abundance);
    const priceIndex = basketPriceIndex(world, abundance, prices);
    applyM2bLaborForDay(world, abundance, dayIndex, priceIndex);
    const displaced = countDisplacedM2b(world);
    const settlement = settleM2aDay(
      ledger,
      world,
      abundance,
      policy,
      dayIndex,
      tick,
      displaced,
      { useQuantityNeeds: true, consumptionState },
    );
    const line = collector.record(settlement, world);
    const flows = flowsFromTransfers(ledger.getTransfers(), firmCount, transferCursor);
    const reasons = reasonTotals(ledger.getTransfers(), transferCursor);
    transferCursor = ledger.getTransfers().length;
    records.push({
      day: dayIndex,
      flows,
      balances: aggregateBalances(ledger, firmCount),
      reasons,
      gini: line.gini,
      payrollCents: settlement.payrollCents,
      firmRevenueCentsTotal: settlement.firmRevenueCentsTotal,
      autoShare: automatedLaborShare(abundance),
    });
  }
  return records;
}

function averageFlows(days: DayRecord[], window: number): Map<string, number> {
  const slice = days.slice(-window);
  const nodes = new Set<string>();
  for (const d of slice) {
    for (const k of d.flows.keys()) nodes.add(k);
  }
  const avg = new Map<string, number>();
  for (const k of nodes) {
    let sum = 0;
    for (const d of slice) sum += d.flows.get(k) ?? 0;
    avg.set(k, sum / slice.length);
  }
  return avg;
}

function printFlowTable(title: string, avg: Map<string, number>, minCents = 100): void {
  console.log(`\n### ${title}`);
  const rows = [...avg.entries()]
    .filter(([, v]) => Math.abs(v) >= minCents)
    .sort((a, b) => b[1] - a[1]);
  console.log("| from | to | avg daily cents |");
  console.log("|------|-----|----------------:|");
  for (const [k, v] of rows) {
    const [from, to] = k.split("->");
    console.log(`| ${from} | ${to} | ${Math.round(v)} |`);
  }
}

function printBalances(title: string, balances: Record<NodeId, number>): void {
  console.log(`\n### ${title}`);
  console.log("| class | balance cents |");
  console.log("|-------|--------------:|");
  const keys = Object.keys(balances).sort();
  for (const k of keys) {
    console.log(`| ${k} | ${balances[k as NodeId]} |`);
  }
}

function printReasons(title: string, reasons: Map<string, number>): void {
  console.log(`\n### ${title} (last-window daily avg)`);
  const rows = [...reasons.entries()].sort((a, b) => b[1] - a[1]);
  console.log("| reason | avg daily cents |");
  console.log("|--------|----------------:|");
  for (const [r, v] of rows) {
    console.log(`| ${r} | ${Math.round(v)} |`);
  }
}

function main(): void {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    JSON.stringify({
      seed: opts.seed,
      days: opts.days,
      policy: opts.policyName,
      mixWeight: opts.mixWeight,
      m2bEnabled: true,
      trailingWindowDays: opts.window,
    }),
  );

  for (const abundance of opts.abundances) {
    const days = runDiagnostic(
      opts.seed,
      opts.days,
      abundance,
      opts.policyName,
      opts.mixWeight,
    );
    const last = days[days.length - 1];
    const avgFlows = averageFlows(days, opts.window);
    const avgReasons = new Map<string, number>();
    for (const d of days.slice(-opts.window)) {
      for (const [r, c] of d.reasons) {
        avgReasons.set(r, (avgReasons.get(r) ?? 0) + c);
      }
    }
    for (const [r, t] of avgReasons) avgReasons.set(r, t / opts.window);

    console.log(`\n# abundance=${abundance}`);
    console.log(
      `autoShare=${last.autoShare}; last-day gini=${last.gini.toFixed(4)} payroll=${last.payrollCents} firmRevenue=${last.firmRevenueCentsTotal}`,
    );
    printFlowTable(
      `30-day average gross flows by class (days ${opts.days - opts.window}–${opts.days - 1})`,
      aggregateFlows(avgFlows),
    );
    printFlowTable(
      `30-day average gross flows by firm (days ${opts.days - opts.window}–${opts.days - 1})`,
      avgFlows,
    );
    printReasons("Transfer reasons", avgReasons);
    const wagePaid = avgReasons.get("wage") ?? 0;
    console.log(
      `\nPayroll target (last day)=${last.payrollCents}; avg daily wage transfers=${Math.round(wagePaid)}; avg firm revenue=${Math.round(
        days.slice(-opts.window).reduce((s, d) => s + d.firmRevenueCentsTotal, 0) / opts.window,
      )}`,
    );

    for (const monthEnd of [30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360, 365]) {
      const dayIdx = Math.min(monthEnd, opts.days) - 1;
      if (dayIdx < 0 || dayIdx >= days.length) continue;
      printBalances(`Balances after day ${dayIdx + 1}`, days[dayIdx].balances);
    }
  }
}

main();
