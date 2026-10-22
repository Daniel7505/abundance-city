import os from "node:os";
import { defaultExclude, defineConfig } from "vitest/config";

const workers = Math.max(1, os.availableParallelism?.() ?? os.cpus().length);

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: [...defaultExclude, "tests/full/**"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: true,
    pool: "forks",
    maxWorkers: workers,
    minWorkers: 1,
  },
});
