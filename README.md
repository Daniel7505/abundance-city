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
```

### Run the browser view

```bash
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`). The view is read-only: it advances the simulation with a fixed seed and draws citizens on the grid.

### Build

```bash
npm run build
```

## Credits

Libraries used in this project:

- [Three.js](https://threejs.org/) — WebGL renderer for the M0 city view
- [Vite](https://vitejs.dev/) — dev server and frontend build
- [Vitest](https://vitest.dev/) — unit tests
- [TypeScript](https://www.typescriptlang.org/) — language tooling
- [tsx](https://github.com/privatenumber/tsx) — TypeScript execution for the headless CLI

## License

MIT — see [LICENSE](LICENSE).
