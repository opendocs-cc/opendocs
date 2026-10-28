import { z } from "zod";

export const visibilitySchema = z.enum([
  "private",
  "workspace",
  "public",
]);

// Matches the CLI's per-doc cap (1 MB). The global Express body limit is 2 MB
// on single-doc routes and 12 MB on /publish/batch, so a 1 MB doc always fits.
export const MAX_MARKDOWN_BYTES = 1_000_000;

// Tags are case-insensitive. Lowercase and de-duplicate up front so
// ["AI", "ai"] doesn't trip the (post_id, tag) unique index mid-insert.
const tagListSchema = z
  .array(z.string().trim().min(1).max(64))
  .max(20)
  .transform((tags) => [...new Set(tags.map((tag) => tag.toLowerCase()))]);

export const publishInputSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    markdown: z.string().min(1).max(MAX_MARKDOWN_BYTES),
    slug: z.string().trim().min(1).max(160).optional(),
    visibility: visibilitySchema.default("workspace"),
    workspaceId: z.string().trim().min(1),
    projectId: z.string().trim().min(1).optional(),
    projectSlug: z.string().trim().min(1).max(64).optional(),
    tags: tagListSchema.default([]),
    sourcePath: z.string().trim().max(1024).optional(),
    confirmPublic: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.visibility === "public" && !value.confirmPublic) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPublic"],
        message: "Public publishing requires explicit confirmation.",
      });
    }
  });

export type PublishInput = z.infer<typeof publishInputSchema>;

export const updatePostInputSchema = z
  .object({
    title: z.string().trim().min(1).max(255).optional(),
    markdown: z.string().min(1).max(MAX_MARKDOWN_BYTES),
    workspaceId: z.string().trim().min(1),
    projectId: z.string().trim().min(1).optional(),
    projectSlug: z.string().trim().min(1).max(64).optional(),
    visibility: visibilitySchema.optional(),
    tags: tagListSchema.optional(),
    sourcePath: z.string().trim().max(1024).optional(),
    confirmPublic: z.boolean().default(false),
    // Stale-base protection: the version the caller's local copy was
    // derived from. When the live post has moved past it (a teammate or
    // another agent updated it), the update is rejected with 409
    // `version_conflict` instead of silently replacing their work.
    baseVersionNumber: z.number().int().positive().optional(),
  })
  .superRefine((value, context) => {
    if (value.visibility === "public" && !value.confirmPublic) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPublic"],
        message: "Public publishing requires explicit confirmation.",
      });
    }
  });

export type UpdatePostInput = z.infer<typeof updatePostInputSchema>;

// Publish batches are sequential on the server, but publishing is still light
// enough that 25 gives vault/folder uploads fewer round trips without making a
// single request too large or too long-running.
export const MAX_PUBLISH_BATCH_SIZE = 25;

// Export batches are heavier: each item can invoke the document converter, so
// keep this lower even though publish can handle larger batches.
export const MAX_EXPORT_BATCH_SIZE = 10;

// Backward-compatible alias for callers that meant "export batch size" before
// publish/export limits diverged.
export const MAX_BATCH_SIZE = MAX_EXPORT_BATCH_SIZE;

export const batchPublishInputSchema = z.object({
  documents: z
    .array(publishInputSchema)
    .min(1, "At least one document is required.")
    .max(
      MAX_PUBLISH_BATCH_SIZE,
      `Maximum ${MAX_PUBLISH_BATCH_SIZE} documents per batch. Split larger uploads into multiple requests.`,
    ),
});

export type BatchPublishInput = z.infer<typeof batchPublishInputSchema>;

// Batch export — keep the ceiling low so end-to-end conversion time stays
// predictable (10 PDFs × ~4s = ~40s, fits inside the CLI's 120s timeout with
// headroom).
export const batchExportInputSchema = z.object({
  postIds: z
    .array(z.string().trim().min(1))
    .min(1, "At least one postId is required.")
    .max(
      MAX_EXPORT_BATCH_SIZE,
      `Maximum ${MAX_EXPORT_BATCH_SIZE} posts per export batch. Split larger exports into multiple requests.`,
    ),
  format: z.enum(["docx", "pdf"]),
  landscape: z.boolean().optional(),
  accent_color: z
    .string()
    .regex(/^#?[0-9A-Fa-f]{6}$/, "accent_color must be a 6-digit hex (e.g. #B91C1C).")
    .optional(),
  // Pass-through to the converter's BrandingConfig — the converter validates
  // the inner shape and returns a clean error if anything is off.
  branding: z.record(z.string(), z.unknown()).optional(),
  // Optional active-workspace scope. The CLI sends this by default using
  // its configured active workspace so slug inputs disambiguate when the
  // same slug exists in multiple workspaces the caller has authored in.
  // UUID inputs ignore it (UUIDs are globally unique); slug inputs use it
  // to add `posts.workspaceId = workspaceId` to the match. Omitted by
  // older clients — falls back to the legacy cross-workspace behaviour.
  workspaceId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
});

export type BatchExportInput = z.infer<typeof batchExportInputSchema>;

export const movePostInputSchema = z
  .object({
    projectId: z.string().trim().min(1).optional(),
    projectSlug: z.string().trim().min(1).max(64).optional(),
  })
  .refine((value) => Boolean(value.projectId || value.projectSlug), {
    message: "Provide projectId or projectSlug.",
  });

const shareEmailSchema = z.string().trim().toLowerCase().email().max(320);
const shareDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^@/, ""))
  .pipe(
    z
      .string()
      .min(3)
      .max(253)
      .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Domain must look like acme.com."),
  );

export const sharePostInputSchema = z
  .object({
    emails: z.array(shareEmailSchema).max(50).default([]),
    domains: z.array(shareDomainSchema).max(20).default([]),
    notify: z.boolean().default(true),
  })
  .refine((value) => value.emails.length > 0 || value.domains.length > 0, {
    message: "Provide at least one email or domain.",
  });

export const unsharePostInputSchema = z
  .object({
    emails: z.array(shareEmailSchema).max(50).default([]),
    domains: z.array(shareDomainSchema).max(20).default([]),
  })
  .refine((value) => value.emails.length > 0 || value.domains.length > 0, {
    message: "Provide at least one email or domain.",
  });

export const patchTagsSchema = z
  .object({
    add: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
    remove: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  })
  .refine((data) => data.add.length > 0 || data.remove.length > 0, {
    message: "Must provide at least one tag to add or remove.",
  });
