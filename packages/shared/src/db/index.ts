import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../env";

const connectionString = env.DATABASE_URL;

// In development, hot reloads re-evaluate this module; without a cache
// each reload opens a new pool and the old one keeps its connections
// until Postgres runs out ("too many clients"). Reuse one client there.
const globalForDb = globalThis as typeof globalThis & {
  __opendocsQueryClient?: ReturnType<typeof postgres>;
};

function createQueryClient(url: string) {
  if (process.env.NODE_ENV === "production") {
    return postgres(url, { prepare: false });
  }
  globalForDb.__opendocsQueryClient ??= postgres(url, { prepare: false });
  return globalForDb.__opendocsQueryClient;
}

export const queryClient = connectionString
  ? createQueryClient(connectionString)
  : null;

export const db = queryClient ? drizzle(queryClient) : null;
