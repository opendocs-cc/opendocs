import { z } from "zod";

import { createSlug } from "../posts/slug";

export const PROJECT_RESERVED_SLUGS = new Set([
  "tag",
  "tags",
  "project",
  "projects",
  "new",
  "edit",
  "settings",
]);

export const projectSlugSchema = z
  .string()
  .trim()
  .min(1, "Project slug is required.")
  .max(64, "Project slug must be at most 64 characters.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Project slug may contain lowercase letters, numbers, and hyphens.",
  );

export function normalizeProjectSlug(input: string) {
  return createSlug(input).slice(0, 64);
}

export function isReservedProjectSlug(slug: string) {
  return PROJECT_RESERVED_SLUGS.has(slug);
}

