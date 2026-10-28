/**
 * Canonical list of sort options for the workspace profile (article
 * list). Both the server (DB orderBy clause) and the client (sort
 * dropdown, URL `?sort=` parsing) read from this single source so a
 * new option only needs to be added in one place.
 *
 * The string values are stable URL identifiers — changing one is a
 * breaking change for any link / bookmark using `?sort=...`. Add new
 * values; don't rename existing ones.
 */
export const POST_SORT_VALUES = [
  "recently-updated",
  "recently-added",
  "title-asc",
  "title-desc",
] as const;

export type PostSort = (typeof POST_SORT_VALUES)[number];

/**
 * Default applied when neither the URL nor the workspace settings
 * pin a sort. "Recently updated" matches the historical behavior of
 * the profile page so existing workspaces don't observe a reorder
 * after this feature ships.
 */
export const DEFAULT_POST_SORT: PostSort = "recently-updated";

/**
 * Human-readable labels for the sort dropdown. Kept here next to the
 * canonical values so a new option lands in both the type and the UI
 * label map atomically.
 */
export const POST_SORT_LABELS: Record<PostSort, string> = {
  "recently-updated": "Recently updated",
  "recently-added": "Recently added",
  "title-asc": "Title (A→Z)",
  "title-desc": "Title (Z→A)",
};

/**
 * Type-guard for parsing untrusted input (URL search params, form
 * payloads). Returns the input as `PostSort` if it's a known value,
 * otherwise `null` so callers can fall back to their default.
 */
export function parsePostSort(value: unknown): PostSort | null {
  if (typeof value !== "string") return null;
  return (POST_SORT_VALUES as readonly string[]).includes(value)
    ? (value as PostSort)
    : null;
}
