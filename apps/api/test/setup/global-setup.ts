import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../../..");

function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
) {
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`));
    });
  });
}

export default async function globalSetup(_project: TestProject) {
  if (process.env.SKIP_OPENDOCS_API_TEST_BOOTSTRAP === "true") {
    return;
  }

  const tempDir = mkdtempSync(resolve(tmpdir(), "opendocs-api-tests-"));
  const envFile = resolve(tempDir, "env.json");

  let container: StartedPostgreSqlContainer | null = null;

  try {
    container = await new PostgreSqlContainer("postgres:16-alpine")
      .withDatabase("opendocs_test")
      .withUsername("opendocs")
      .withPassword("opendocs")
      .start();
  } catch (error) {
    rmSync(tempDir, { recursive: true, force: true });
    throw new Error(
      [
        "OpenDocs API endpoint tests require Docker so a disposable PostgreSQL instance can be started.",
        "Start Docker (or another compatible container runtime) and re-run `npm run test`.",
        error instanceof Error ? `Original error: ${error.message}` : "Container startup failed.",
      ].join(" "),
    );
  }

  const testEnv = {
    NODE_ENV: "test",
    DATABASE_URL: container.getConnectionUri(),
    BETTER_AUTH_SECRET: "opendocs-test-secret",
    API_URL: "http://127.0.0.1:4000",
    BETTER_AUTH_URL: "http://127.0.0.1:3000",
    CORS_ORIGINS: "http://localhost:3000",
  };

  writeFileSync(envFile, JSON.stringify(testEnv), "utf8");
  process.env.OPENDOCS_API_TEST_ENV_FILE = envFile;
  Object.assign(process.env, testEnv);

  // Invoke drizzle-kit directly with `--force` so it bypasses the strict-mode
  // confirmation prompt (drizzle.config.ts has `strict: true`, which is the
  // right default for humans pushing to real databases but would deadlock in
  // a non-TTY test run). Not going through `npm run db:push` means the
  // production script keeps its safety prompt.
  await runCommand("npx", ["drizzle-kit", "push", "--force"], {
    ...process.env,
    ...testEnv,
  });

  return async () => {
    await container.stop();
    rmSync(tempDir, { recursive: true, force: true });
  };
}
