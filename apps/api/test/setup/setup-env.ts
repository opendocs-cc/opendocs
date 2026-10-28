import { readFileSync } from "node:fs";

const envFile = process.env.OPENDOCS_API_TEST_ENV_FILE;

if (!envFile) {
  if (process.env.SKIP_OPENDOCS_API_TEST_BOOTSTRAP === "true") {
    process.env.NODE_ENV = "test";
  } else {
    throw new Error("Missing OPENDOCS_API_TEST_ENV_FILE. Global test setup did not run.");
  }
}

if (!envFile) {
  // Bootstrap is intentionally skipped for discovery-only commands.
} else {
  const raw = JSON.parse(readFileSync(envFile, "utf8")) as Record<string, string>;
  Object.assign(process.env, raw);
}
