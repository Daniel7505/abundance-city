# abundance-city

Abundance City is a browser city simulation where every agent runs on a real **energy** and **money** budget. Milestone **M0** establishes a deterministic, headless simulation core and a read-only Three.js view of citizen positions on the grid.

## Milestone M0

M0 includes:

- **Deterministic sim core** (`src/sim/`): seeded PRNG (Mulberry32), fixed-timestep tick loop — no `Math.random` and no wall-clock time inside the simulation.
- **Map**: 32×32 grid with a home region (northwest) and work region (southeast).
- **Citizens**: 100 agents that commute from home to work and back on Manhattan grid paths.
- **Energy model** (placeholder coefficients in `src/sim/config.ts`):

  `ΔWh ≈ a·Δd + b·Δd·v² + c·Δt`

  per tick, matching the robot locomotion project’s structure.

- **Logging**: per-tick JSONL lines (`tick`, `agentId`, `x`, `y`, `cumulativeWh`) plus an end-of-run JSON summary.
- **Headless CLI** for Node.
- **Browser view**: minimal Three.js page that steps the same sim and renders citizens as dots.
- **Tests**: determinism, energy monotonicity, and summary consistency.

### Run the headless simulation

```bash
npm install
npm run sim -- --seed 42 --ticks 500
```

Logs are written under `logs/`:

- `seed-<seed>-ticks-<n>.jsonl` — one JSON object per line per agent per tick
- `seed-<seed>-ticks-<n>.summary.json` — aggregate energy totals

Optional: `--out <directory>` to change the output folder.

### Run tests

```bash
npm test
npm run test:full
```

`npm test` is the fast subset (mechanics, a short money sample, determinism, adaptive-premium direction, automation-path and ownership checks). `npm run test:full` also runs the 365-day gates: a=0 median, Gini, wage gap, money conservation, and the agent-count check for every land policy and producer-ownership setting, plus a 10-year logistic run. CI runs `test:full`. A simulation that exceeds its wall-clock budget throws instead of stalling the worker.

### Run the browser view

```bash
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). The view is read-only: it advances the simulation with a fixed seed and draws citizens on the grid.

### Build

```bash
npm run build
```

## Milestone M1 — economy & abundance dial v0

M1 adds a closed-loop **integer-cent economy** and an **abundance dial** `a ∈ [0, 1]` (fixed per run). The M0 movement loop and browser view are unchanged; M1 runs headless via the CLI.

- **World** (canonical seed-42 layout): 10 homes × 10 citizens, 5 workplaces (100 base job slots), 1 automated producer.
- **Day cycle**: 24 ticks; jobs, wages, rent, purchases, and dividends settle on tick 23.
- **Ledger** (`src/economy/ledger.ts`): all money moves through `transfer(from, to, cents, reason)` — no mint/burn after initialization.
- **Dial**: `jobs = round((1-a)·100)` (slots removed in workplace id order); `price = p0·(1 - 0.6·a)`; producer share `a` of goods output (no wages).
- **Config**: `config/economy.json`, energy-per-goods placeholders in `data/coefficients.json`.
- **Daily metrics JSONL**: `workOptionalShare`, `costPerPerson`, `totalEnergyWh` (human/automated), `jobs`, `employed`, `price`, `moneySupply`, `unmetNeed`.

### Run M1 simulation

```bash
npm run sim -- --m1 --seed 42 --abundance 0.5 --days 30
```

Outputs under `logs/` (or `--out`):

- `seed-<seed>-a-<a>-days-<n>.jsonl` — per-tick agent positions (same shape as M0)
- `seed-<seed>-a-<a>-days-<n>.daily.jsonl` — one metrics object per simulated day
- `seed-<seed>-a-<a>-days-<n>.summary.json` — run summary

M0 mode remains the default (`npm run sim -- --seed 42 --ticks 100`).

## Milestone M2a — Lindsborg heterogeneous households

M2a models **Lindsborg, KS** from sourced ACS/BLS/EIA data (`data/towns/lindsborg-ks.json`), with heterogeneous households, 13 industry firms, and a non-binary `workOptionalShare` driven by trailing household non-wage income vs needs. M0/M1 legacy modes are unchanged.

```bash
npm run sim -- --m2a --seed 42 --abundance 0.5 --days 60
```

Writes `m2a-seed-<seed>-a-<a>-days-<n>.daily.jsonl` and a JSON summary (no per-tick agent logs).

## Milestone M3 — automation path, transition harm, public ownership

The default run still holds abundance fixed. `--automation-path linear` or `logistic` follows a schedule `a(t)` (default horizon 3650 days, a 10-year logistic from 0 to 1). Hiring, prices, task caps, and the human premium use that day's level.

`--ownership` is `PrivateOwners` (current producer residual), `PublicFund` (placeholder share 0.5, paid as an equal per-household dividend), or `GradualBuyIn` (the fund's share starts at 0 and grows by reinvesting a placeholder fraction of its income). `--ownership-levy` overrides the GradualBuyIn profit levy for that run. The default levy in `data/coefficients.json` stays 0.05. Schedule and ownership coefficients are labeled placeholders.

Each year the result records work-optional share, disposable-income Gini, and the share and depth of household-days whose disposable income is below the subsistence basket. That basket is the legacy food and electricity budgets scaled by the goods-price index, plus burden-calibrated housing. It is not the quantity basket the day uses for purchases: those quantities were converted at a pre-wage reference price, so at a=0 they cost about a full day of ACS income. Settlement is unchanged. Spell p50/p90/max are the longest consecutive shortfall from day 0. The year also records the share of households ever short and the share short on more than half of the year's days. Quintiles are equal-count ranks. Year 1 uses worldgen ACS annual income, because no disposable history exists yet. Each later year re-ranks by the previous year's total disposable income. Age bands are mean member age at worldgen. At a=0 the subsistence bill is covered in every quintile. Q1's bill is the largest share of its wage, and flat transfers (unemployment insurance, social security, and the equal half of Mix) cover that smaller bill first, so a middle quintile can be the first to miss the basket while ranks are still the worldgen incomes. After the re-rank, the low-cash households are Q1.

```bash
npx tsx scripts/m3-report.ts
```

That script is the 5-seed sweep. It prints to stdout and does not write run artifacts.

## Credits

Libraries and public data used in this project:

- [Three.js](https://threejs.org/) — WebGL renderer for the M0 city view
- [Vite](https://vitejs.dev/) — dev server and frontend build
- [Vitest](https://vitest.dev/) — unit tests
- [TypeScript](https://www.typescriptlang.org/) — language tooling
- [tsx](https://github.com/privatenumber/tsx) — TypeScript execution for the headless CLI
- [U.S. Census Bureau / ACS](https://www.census.gov/programs-surveys/acs) — Lindsborg place profile via Census Reporter API
- [U.S. Bureau of Labor Statistics](https://www.bls.gov/) — Consumer Expenditure category shares
- [U.S. Energy Information Administration](https://www.eia.gov/) — Kansas residential electricity price

## License

MIT — see [LICENSE](LICENSE).
