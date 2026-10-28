import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rootDir,
  test: {
    environment: "node",
    globalSetup: [resolve(rootDir, "test/setup/global-setup.ts")],
    setupFiles: [resolve(rootDir, "test/setup/setup-env.ts")],
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 120_000,
    testTimeout: 120_000,
  },
});
