import os from "node:os";
import { defineConfig } from "vitest/config";

const workers = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);

/** Full gate sweep, including 365-day runs. `npm test` excludes tests/full. */
export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    fileParallelism: true,
    pool: "forks",
    maxWorkers: workers,
    minWorkers: 1,
  },
});
