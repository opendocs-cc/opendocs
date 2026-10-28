import { and, eq, inArray, or } from "drizzle-orm";

import { siteConfig } from "../config/site";
import { getDbOrThrow } from "../db/guards";
import {
  auditEvents,
  postRestrictedEmails,
  posts,
  projects,
  user,
  usernames,
  workspaces,
} from "../db/schema";
import { documentSharedEmail, sendEmail } from "../email";
import { postUrlPath } from "../projects/service";
import { assertCanManageWorkspacePost } from "./service";

/**
 * Per-document guest access. Rows in `post_restricted_emails` grant read
 * access to one email address (`rule_type = 'email'`) or everyone at a
 * domain (`rule_type = 'domain'`), on top of whatever the post's
 * visibility already allows. Guests never become workspace members and
 * only ever see the shared documents themselves.
 *
 * A grant only applies to signed-in viewers whose email is verified —
 * otherwise anyone could register an unverified account with the invitee's
 * address and read the document. Email-code sign-in and OAuth both verify.
 */

type ShareRuleType = "email" | "domain";

async function loadManageablePost(userId: string, postId: string) {
  const database = getDbOrThrow();
  const [post] = await database
    .select({
      id: posts.id,
      title: posts.title,
      slug: posts.slug,
      authorUserId: posts.authorUserId,
      workspaceId: posts.workspaceId,
      workspaceSlug: workspaces.slug,
      projectSlug: projects.slug,
      isDefaultProject: projects.isDefault,
      isPublished: posts.isPublished,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .innerJoin(projects, eq(posts.projectId, projects.id))
    .where(eq(posts.id, postId))
    .limit(1);
  if (!post) {
    throw new Error("Post not found.");
  }
  await assertCanManageWorkspacePost(userId, post);
  return post;
}

async function readShares(postId: string) {
  const database = getDbOrThrow();
  const rows = await database
    .select({ ruleType: postRestrictedEmails.ruleType, value: postRestrictedEmails.value })
    .from(postRestrictedEmails)
    .where(eq(postRestrictedEmails.postId, postId))
    .orderBy(postRestrictedEmails.createdAt);
  return {
    emails: rows.filter((row) => row.ruleType === "email").map((row) => row.value),
    domains: rows.filter((row) => row.ruleType === "domain").map((row) => row.value),
  };
}

export async function listPostShares(userId: string, postId: string) {
  await loadManageablePost(userId, postId);
  return readShares(postId);
}

export async function addPostShares(
  userId: string,
  postId: string,
  input: { emails: string[]; domains: string[]; notify: boolean },
) {
  const post = await loadManageablePost(userId, postId);
  if (!post.isPublished) {
    throw new Error("Cannot share an unpublished post.");
  }
  const database = getDbOrThrow();
  const before = await readShares(postId);

  const rules: Array<{ ruleType: ShareRuleType; value: string }> = [
    ...input.emails.map((value) => ({ ruleType: "email" as const, value })),
    ...input.domains.map((value) => ({ ruleType: "domain" as const, value })),
  ];

  await database.transaction(async (tx) => {
    await tx
      .insert(postRestrictedEmails)
      .values(rules.map((rule) => ({ ...rule, postId, addedByUserId: userId })))
      .onConflictDoNothing();
    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "shared",
      metadata: { emails: input.emails, domains: input.domains },
    });
  });

  const after = await readShares(postId);
  const newEmails = after.emails.filter((email) => !before.emails.includes(email));
  const newDomains = after.domains.filter((domain) => !before.domains.includes(domain));

  const url = `${process.env.WEB_APP_URL ?? siteConfig.url}${postUrlPath(
    post.workspaceSlug,
    { slug: post.projectSlug, isDefault: post.isDefaultProject },
    post.slug,
  )}`;

  let notified: string[] = [];
  if (input.notify && newEmails.length > 0) {
    const [sharer] = await database
      .select({ name: user.name, username: usernames.username })
      .from(user)
      .leftJoin(usernames, eq(usernames.userId, user.id))
      .where(eq(user.id, userId))
      .limit(1);
    const sharedByName = sharer?.name?.trim() || sharer?.username || "A teammate";
    const results = await Promise.allSettled(
      newEmails.map((to) =>
        sendEmail({
          to,
          subject: `${sharedByName} shared "${post.title}" with you`,
          html: documentSharedEmail({ docUrl: url, docTitle: post.title, sharedByName }),
        }).then(() => to),
      ),
    );
    notified = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  }

  return { ...after, added: { emails: newEmails, domains: newDomains }, notified, url };
}

export async function removePostShares(
  userId: string,
  postId: string,
  input: { emails: string[]; domains: string[] },
) {
  const post = await loadManageablePost(userId, postId);
  const database = getDbOrThrow();
  const values = [...input.emails, ...input.domains];
  await database.transaction(async (tx) => {
    await tx
      .delete(postRestrictedEmails)
      .where(
        and(eq(postRestrictedEmails.postId, postId), inArray(postRestrictedEmails.value, values)),
      );
    await tx.insert(auditEvents).values({
      actorUserId: userId,
      workspaceId: post.workspaceId,
      postId,
      eventType: "unshared",
      metadata: { emails: input.emails, domains: input.domains },
    });
  });
  return readShares(postId);
}

/**
 * True when the post was shared with the viewer's verified email address
 * or its domain.
 */
export async function isPostSharedWithViewer(
  postId: string,
  viewerUserId: string | null | undefined,
): Promise<boolean> {
  if (!viewerUserId) return false;
  const database = getDbOrThrow();
  const [viewer] = await database
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, viewerUserId))
    .limit(1);
  if (!viewer?.emailVerified) return false;

  const email = viewer.email.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  const [match] = await database
    .select({ id: postRestrictedEmails.id })
    .from(postRestrictedEmails)
    .where(
      and(
        eq(postRestrictedEmails.postId, postId),
        or(
          and(eq(postRestrictedEmails.ruleType, "email"), eq(postRestrictedEmails.value, email)),
          and(eq(postRestrictedEmails.ruleType, "domain"), eq(postRestrictedEmails.value, domain)),
        ),
      ),
    )
    .limit(1);
  return Boolean(match);
}

/**
 * Whether anything published in a workspace is shared with this user: their
 * verified email, or its domain, on any of the workspace's documents. The
 * custom-domain sign-in (app/auth/bridge) asks before handing a non-member
 * to a workspace's domain: with nothing shared there, there's nothing they
 * could read, so they stop on opendocs.cc and the domain never learns who
 * they are.
 */
export async function hasDocumentsSharedInWorkspace(
  viewerUserId: string,
  workspaceId: string,
): Promise<boolean> {
  const database = getDbOrThrow();
  const [viewer] = await database
    .select({ email: user.email, emailVerified: user.emailVerified })
    .from(user)
    .where(eq(user.id, viewerUserId))
    .limit(1);
  if (!viewer?.emailVerified) return false;

  const email = viewer.email.trim().toLowerCase();
  const domain = email.split("@")[1] ?? "";
  const [match] = await database
    .select({ id: postRestrictedEmails.id })
    .from(postRestrictedEmails)
    .innerJoin(posts, eq(posts.id, postRestrictedEmails.postId))
    .where(
      and(
        eq(posts.workspaceId, workspaceId),
        eq(posts.isPublished, true),
        or(
          and(eq(postRestrictedEmails.ruleType, "email"), eq(postRestrictedEmails.value, email)),
          and(eq(postRestrictedEmails.ruleType, "domain"), eq(postRestrictedEmails.value, domain)),
        ),
      ),
    )
    .limit(1);
  return Boolean(match);
}
