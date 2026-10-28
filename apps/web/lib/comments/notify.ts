import { and, eq } from "drizzle-orm";

import { instanceHost } from "@opendocs/shared/config/instance";
import { getDbOrThrow } from "@opendocs/shared/db/guards";
import { posts, usernames, workspaces } from "@opendocs/shared/db/schema";
import { sendEmail } from "@opendocs/shared/email";
import { siteConfig } from "@opendocs/shared/config/site";
import type { CommentRecord } from "@opendocs/shared/comments/service";
import { getCommentNotificationRecipients } from "@opendocs/shared/comments/service";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Notifies the post author and everyone already on the thread when a
 * new comment lands. Deliberately simple: one email per recipient per
 * comment, no batching or "digest" logic. If that turns noisy we can
 * debounce per-user at the edge — for now the volume is tiny (small
 * workspaces, human typing speed) and skipping the digest layer keeps
 * the comment loop feeling live.
 *
 * The commenter themselves is excluded at the service layer. We also
 * skip notifications for resolution/update/delete actions — those
 * aren't "new content" and would pollute inboxes.
 */
export async function notifyCommentAdded(
  comment: CommentRecord,
  authorUserId: string,
): Promise<void> {
  const database = getDbOrThrow();

  const [postRow] = await database
    .select({
      title: posts.title,
      slug: posts.slug,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
    })
    .from(posts)
    .innerJoin(workspaces, eq(posts.workspaceId, workspaces.id))
    .where(eq(posts.id, comment.postId))
    .limit(1);
  if (!postRow) return;

  const [authorRow] = await database
    .select({
      fullName: usernames.fullName,
      username: usernames.username,
    })
    .from(usernames)
    .where(eq(usernames.userId, authorUserId))
    .limit(1);

  const authorDisplay =
    authorRow?.fullName ||
    authorRow?.username ||
    "A workspace member";

  const recipients = await getCommentNotificationRecipients(
    comment.postId,
    authorUserId,
  );
  if (recipients.length === 0) return;

  const docUrl = `${siteConfig.url}/${postRow.workspaceSlug}/${postRow.slug}`;
  const subject = comment.parentCommentId
    ? `New reply on "${postRow.title}"`
    : `New comment on "${postRow.title}"`;

  const safeAuthor = escapeHtml(authorDisplay);
  const safeTitle = escapeHtml(postRow.title);
  const safeBody = escapeHtml(comment.body);
  const safeQuoted = comment.quotedText
    ? escapeHtml(comment.quotedText)
    : null;
  const safeUrl = escapeHtml(docUrl);
  const safeWorkspace = escapeHtml(
    postRow.workspaceName || postRow.workspaceSlug,
  );

  const quotedBlock = safeQuoted
    ? `<blockquote style="border-left: 3px solid #6B3FC9; margin: 0 0 1rem; padding: 0.5rem 0.75rem; color: #52525b; font-style: italic; background: #faf8ff; border-radius: 0 6px 6px 0;">
        &ldquo;${safeQuoted}&rdquo;
      </blockquote>`
    : "";

  const html = `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 2rem 0;">
      <h2 style="font-size: 1.15rem; font-weight: 600; margin: 0 0 0.5rem;">${safeAuthor} commented on &ldquo;${safeTitle}&rdquo;</h2>
      <p style="color: #71717a; font-size: 0.85rem; margin: 0 0 1.25rem;">In ${safeWorkspace}</p>
      ${quotedBlock}
      <p style="color: #27272a; line-height: 1.6; margin: 0 0 1.5rem; white-space: pre-wrap;">${safeBody}</p>
      <a href="${safeUrl}" style="display: inline-block; background: #6B3FC9; color: #fff; text-decoration: none; padding: 0.75rem 1.25rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;">
        View on OpenDocs
      </a>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0 1rem;" />
      <p style="color: #a1a1aa; font-size: 0.8rem; margin: 0;">OpenDocs &middot; ${instanceHost()}</p>
    </div>
  `;

  // Sequential so a single Resend hiccup can't cascade into a retry
  // storm. Recipient counts are small (workspace team size).
  for (const recipient of recipients) {
    try {
      await sendEmail({ to: recipient.email, subject, html });
    } catch (err) {
      console.error(
        `[comments] failed to email ${recipient.email}`,
        err,
      );
    }
  }
}
