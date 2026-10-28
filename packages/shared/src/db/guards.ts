import { db } from "./index";

export function getDbOrThrow() {
  if (!db) {
    throw new Error("Database is not configured.");
  }

  return db;
}
