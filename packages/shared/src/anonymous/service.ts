import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, count, eq, isNull, lt } from "drizzle-orm";
import { z } from "zod";

import {
  ANONYMOUS_REPORT_REASONS,
  FREE_TOOL_LIMITS,
  type AnonymousReportReason,
} from "../config/free-tools";
import { hideAfterDistinctReporters } from "../config/free-tools-env";
import { getDbOrThrow } from "../db/guards";
import { anonymousDocReports, anonymousDocs, auditEvents } from "../db/schema";
import { renderMarkdown } from "../markdown/index";
import { extractMarkdownExcerpt } from "../posts/excerpt";
import { publishPostForUser } from "../posts/service";

/**
 * Anonymous documents: publish without an account, get a link that works
 * for 24 hours, and keep it by claiming it into a workspace.
 *
 * - The public id is 128 random bits, so the link is the only way in. The
 *   reader page is `noindex` and never listed anywhere.
 * - The claim token is shown once; only its SHA-256 is stored. Holding it
 *   lets the creator update the doc while it's anonymous, and claim it.
 * - No image rehosting (there's no workspace to bill storage to) and a
 *   smaller size cap than real posts.
 * - Readers can report a page; enough reports from different addresses hide
 *   it until the owner restores or removes it (Telegram /restore, /remove).
 */

export const ANONYMOUS_DOC_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_ANONYMOUS_MARKDOWN_BYTES = FREE_TOOL_LIMITS.anonymousPublish.maxBytes;

export const anonymousPublishInputSchema = z.object({
  markdown: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, {
      message: "The Markdown is empty. Add some text and try again.",
    })
    .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_ANONYMOUS_MARKDOWN_BYTES, {
      message: `Anonymous documents are limited to ${MAX_ANONYMOUS_MARKDOWN_BYTES / 1000} KB. Sign in to publish larger documents.`,
    }),
  title: z.string().trim().min(1).max(255).optional(),
});

export const anonymousUpdateInputSchema = anonymousPublishInputSchema.extend({
  claimToken: z.string().trim().min(1),
});

export const claimAnonymousInputSchema = z
  .object({
    claimToken: z.string().trim().min(1),
    workspaceId: z.string().trim().min(1),
    projectId: z.string().trim().min(1).optional(),
    projectSlug: z.string().trim().min(1).max(64).optional(),
    visibility: z.enum(["private", "workspace", "public"]).default("workspace"),
    confirmPublic: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.visibility === "public" && !value.confirmPublic) {
      context.addIssue({
        code: "custom",
        path: ["confirmPublic"],
        message: "Public publishing requires explicit confirmation.",
      });
    }
  });

export const reportAnonymousDocInputSchema = z.object({
  reason: z.enum(Object.keys(ANONYMOUS_REPORT_REASONS) as [AnonymousReportReason, ...AnonymousReportReason[]]),
  details: z.string().trim().max(FREE_TOOL_LIMITS.reports.maxDetailsLength).optional(),
});

export class AnonymousDocError extends Error {
  constructor(
    public readonly code: "not_found" | "expired" | "invalid_claim_token" | "hidden",
    message: string,
  ) {
    super(message);
    this.name = "AnonymousDocError";
  }
}

export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokensMatch(expectedHash: string, token: string): boolean {
  const actual = Buffer.from(hashClaimToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function anonymousDocPath(id: string) {
  return `/a/${id}`;
}

export function claimPath(claimToken: string) {
  return `/claim/${claimToken}`;
}

async function renderForAnonymous(markdown: string, title?: string) {
  const rendered = await renderMarkdown(markdown);
  const resolvedTitle = (title ?? rendered.title).slice(0, 255);
  return {
    title: resolvedTitle,
    summary: extractMarkdownExcerpt(rendered.content) || null,
    renderedHtml: rendered.html,
    toc: rendered.toc,
  };
}

export async function createAnonymousDoc(input: {
  markdown: string;
  title?: string;
  client?: string | null;
}) {
  const database = getDbOrThrow();
  const id = randomBytes(16).toString("base64url");
  const claimToken = `odc_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + ANONYMOUS_DOC_TTL_MS);
  const rendered = await renderForAnonymous(input.markdown, input.title);

  await database.insert(anonymousDocs).values({
    id,
    claimTokenHash: hashClaimToken(claimToken),
    title: rendered.title,
    summary: rendered.summary,
    rawMarkdown: input.markdown,
    renderedHtml: rendered.renderedHtml,
    toc: rendered.toc,
    client: input.client ?? null,
    expiresAt,
  });

  return {
    id,
    claimToken,
    title: rendered.title,
    path: anonymousDocPath(id),
    claimPath: claimPath(claimToken),
    expiresAt,
  };
}

async function loadLiveDoc(id: string) {
  const database = getDbOrThrow();
  const [doc] = await database.select().from(anonymousDocs).where(eq(anonymousDocs.id, id)).limit(1);
  if (!doc) {
    throw new AnonymousDocError("not_found", "Anonymous document not found.");
  }
  if (doc.expiresAt.getTime() <= Date.now()) {
    await database.delete(anonymousDocs).where(eq(anonymousDocs.id, id));
    throw new AnonymousDocError("expired", "This anonymous document has expired.");
  }
  return doc;
}

const HIDDEN_MESSAGE =
  "This document was reported by readers and is hidden while we review it.";

/** Replaces the content. Updates never extend the 24-hour expiry. */
export async function updateAnonymousDoc(
  id: string,
  input: { markdown: string; title?: string; claimToken: string; client?: string | null },
) {
  const doc = await loadLiveDoc(id);
  if (!tokensMatch(doc.claimTokenHash, input.claimToken)) {
    throw new AnonymousDocError("invalid_claim_token", "The claim token does not match this document.");
  }
  // A hidden page stays as it was reported until the owner has looked at it.
  if (doc.hiddenAt) {
    throw new AnonymousDocError("hidden", HIDDEN_MESSAGE);
  }
  const rendered = await renderForAnonymous(input.markdown, input.title);
  const database = getDbOrThrow();
  await database
    .update(anonymousDocs)
    .set({
      title: rendered.title,
      summary: rendered.summary,
      rawMarkdown: input.markdown,
      renderedHtml: rendered.renderedHtml,
      toc: rendered.toc,
      client: input.client ?? doc.client,
      updatedAt: new Date(),
    })
    .where(eq(anonymousDocs.id, id));

  return {
    id,
    title: rendered.title,
    path: anonymousDocPath(id),
    expiresAt: doc.expiresAt,
  };
}

/**
 * Public read for the reader page. Null when missing or expired. A page
 * hidden after reports comes back with `hidden: true` and no content.
 */
export async function getAnonymousDoc(id: string) {
  try {
    const doc = await loadLiveDoc(id);
    const hidden = doc.hiddenAt !== null;
    return {
      id: doc.id,
      title: doc.title,
      summary: hidden ? null : doc.summary,
      renderedHtml: hidden ? "" : doc.renderedHtml,
      toc: hidden ? [] : (doc.toc ?? []),
      hidden,
      client: doc.client,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      expiresAt: doc.expiresAt,
    };
  } catch (err) {
    if (err instanceof AnonymousDocError) return null;
    throw err;
  }
}

/**
 * The Markdown of a live, visible doc for a PDF download (anyone with the
 * link can read it, so anyone with the link can download it). Null when the
 * doc is gone or hidden after reports.
 */
export async function getAnonymousDocForExport(id: string) {
  try {
    const doc = await loadLiveDoc(id);
    if (doc.hiddenAt !== null) return null;
    return { id: doc.id, title: doc.title, markdown: doc.rawMarkdown, client: doc.client };
  } catch (err) {
    if (err instanceof AnonymousDocError) return null;
    throw err;
  }
}

/** Looks up a doc by its claim token, for the claim page. Null when gone. */
export async function getAnonymousDocByClaimToken(claimToken: string) {
  const database = getDbOrThrow();
  const [doc] = await database
    .select({
      id: anonymousDocs.id,
      title: anonymousDocs.title,
      summary: anonymousDocs.summary,
      expiresAt: anonymousDocs.expiresAt,
      hiddenAt: anonymousDocs.hiddenAt,
    })
    .from(anonymousDocs)
    .where(eq(anonymousDocs.claimTokenHash, hashClaimToken(claimToken)))
    .limit(1);
  if (!doc || doc.expiresAt.getTime() <= Date.now()) return null;
  const { hiddenAt, ...rest } = doc;
  return { ...rest, hidden: hiddenAt !== null };
}

/**
 * Moves an anonymous doc into the caller's workspace as a normal post
 * (private-by-default rules apply again: `workspace` visibility unless the
 * caller asks otherwise) and deletes the anonymous copy, so the old link
 * stops working.
 */
export async function claimAnonymousDoc(
  userId: string,
  input: z.infer<typeof claimAnonymousInputSchema>,
  options: { client?: string | null } = {},
) {
  const database = getDbOrThrow();
  const [doc] = await database
    .select()
    .from(anonymousDocs)
    .where(eq(anonymousDocs.claimTokenHash, hashClaimToken(input.claimToken)))
    .limit(1);
  if (!doc) {
    throw new AnonymousDocError("not_found", "No anonymous document matches this claim token.");
  }
  if (doc.expiresAt.getTime() <= Date.now()) {
    await database.delete(anonymousDocs).where(eq(anonymousDocs.id, doc.id));
    throw new AnonymousDocError("expired", "This anonymous document has expired and can no longer be claimed.");
  }
  if (doc.hiddenAt) {
    throw new AnonymousDocError("hidden", HIDDEN_MESSAGE);
  }

  const post = await publishPostForUser(
    userId,
    {
      markdown: doc.rawMarkdown,
      title: doc.title,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      projectSlug: input.projectSlug,
      visibility: input.visibility,
      confirmPublic: input.confirmPublic,
      tags: [],
    },
    { client: options.client ?? doc.client },
  );

  await database.transaction(async (tx) => {
    await tx.delete(anonymousDocs).where(eq(anonymousDocs.id, doc.id));
    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: input.workspaceId,
      postId: post.postId,
      eventType: "claimed",
      metadata: { anonymousDocId: doc.id },
    });
  });

  return { ...post, claimedFrom: doc.id };
}

/** Deletes expired anonymous docs. Returns how many were removed. */
export async function deleteExpiredAnonymousDocs(now = new Date()) {
  const database = getDbOrThrow();
  const deleted = await database
    .delete(anonymousDocs)
    .where(lt(anonymousDocs.expiresAt, now))
    .returning({ id: anonymousDocs.id });
  return deleted.length;
}

/**
 * The stored form of a reporter's address: an HMAC, so reports can be told
 * apart without keeping addresses. `reporterKey` is the caller's
 * rate-limit key (an IPv4 address, or an IPv6 /56 prefix).
 */
export function reporterFingerprint(reporterKey: string): string {
  const secret = process.env.BETTER_AUTH_SECRET || "opendocs-anonymous-reports";
  return createHmac("sha256", secret).update(`anonymous-report:${reporterKey}`, "utf8").digest("hex");
}

/**
 * Records a reader's report. The same reporter reporting the same page again
 * changes nothing. Once `FREE_TOOL_LIMITS.reports.hideAfterDistinctReporters`
 * (or ANONYMOUS_REPORTS_HIDE_AFTER, see config/free-tools-env.ts) different
 * reporters have reported it, the page is hidden.
 *
 * `firstReport` and `newlyHidden` say when to tell the owner, so a page
 * reported many times sends two messages, not one per report.
 */
export async function reportAnonymousDoc(
  id: string,
  input: z.infer<typeof reportAnonymousDocInputSchema> & { reporterKey: string },
) {
  const doc = await loadLiveDoc(id);
  const database = getDbOrThrow();
  const inserted = await database
    .insert(anonymousDocReports)
    .values({
      anonymousDocId: id,
      reporterHash: reporterFingerprint(input.reporterKey),
      reason: input.reason,
      details: input.details?.trim() || null,
    })
    .onConflictDoNothing()
    .returning({ id: anonymousDocReports.id });

  const [{ value: reports }] = await database
    .select({ value: count() })
    .from(anonymousDocReports)
    .where(eq(anonymousDocReports.anonymousDocId, id));

  let newlyHidden = false;
  if (!doc.hiddenAt && reports >= hideAfterDistinctReporters()) {
    const hidden = await database
      .update(anonymousDocs)
      .set({ hiddenAt: new Date() })
      .where(and(eq(anonymousDocs.id, id), isNull(anonymousDocs.hiddenAt)))
      .returning({ id: anonymousDocs.id });
    newlyHidden = hidden.length > 0;
  }

  return {
    id: doc.id,
    title: doc.title,
    path: anonymousDocPath(doc.id),
    recorded: inserted.length > 0,
    firstReport: inserted.length > 0 && reports === 1,
    reports,
    hidden: doc.hiddenAt !== null || newlyHidden,
    newlyHidden,
  };
}

/**
 * The owner's review found nothing wrong: shows the page again and clears
 * its reports, so it takes fresh reports to hide it again. False when the
 * page is gone.
 */
export async function restoreAnonymousDoc(id: string): Promise<boolean> {
  const database = getDbOrThrow();
  return database.transaction(async (tx) => {
    const restored = await tx
      .update(anonymousDocs)
      .set({ hiddenAt: null })
      .where(eq(anonymousDocs.id, id))
      .returning({ id: anonymousDocs.id });
    if (restored.length === 0) return false;
    await tx.delete(anonymousDocReports).where(eq(anonymousDocReports.anonymousDocId, id));
    return true;
  });
}

/** The owner's review found abuse: deletes the page now. False when already gone. */
export async function removeAnonymousDoc(id: string): Promise<boolean> {
  const database = getDbOrThrow();
  const removed = await database
    .delete(anonymousDocs)
    .where(eq(anonymousDocs.id, id))
    .returning({ id: anonymousDocs.id });
  return removed.length > 0;
}
