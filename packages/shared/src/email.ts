import { Resend } from "resend";

import { OPENDOCS_CC, instanceApiUrl, instanceHost, isOpenDocsCc, isSelfHosted } from "./config/instance";
import { env } from "./env";

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const fromAddress = env.EMAIL_FROM ?? "OpenDocs <noreply@opendocs.cc>";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type OutboxEmail = { to: string; subject: string; html: string };

/**
 * Emails that would have been sent while Resend is not configured (local
 * dev and tests). Tests read sign-in codes from here; nothing reads it in
 * production, where a missing Resend key throws instead.
 */
export const devOutbox: OutboxEmail[] = [];

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}) {
  if (!resend) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Email delivery is not configured.");
    }
    devOutbox.push({ to, subject, html });
    if (devOutbox.length > 100) devOutbox.shift();
    if (process.env.NODE_ENV === "test") return;
    console.warn("[email] RESEND_API_KEY not set; email was not sent.");
    console.warn(`  To: ${to}`);
    console.warn(`  Subject: ${subject}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: fromAddress,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[email] Failed to send:", error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

/**
 * Footer for emails a person receives because someone else used OpenDocs
 * (invitations, shares): one line that says what OpenDocs is, linked with
 * a UTM tag so signups from these emails show up in analytics.
 */
function sentWithOpenDocsFooter(utmContent: string): string {
  // A self-hosted instance's emails don't advertise opendocs.cc.
  if (isSelfHosted()) return "";
  const url = `${OPENDOCS_CC.web}/?utm_source=email&utm_medium=product&utm_content=${utmContent}`;
  return `Sent with <a href="${url}" style="color: #71717a; text-decoration: underline;">OpenDocs</a>, where AI agents publish Markdown.`;
}

export function teamInvitationEmail({
  inviteUrl,
  workspaceName,
  invitedByName,
}: {
  inviteUrl: string;
  workspaceName: string;
  invitedByName: string;
}): string {
  const safeInviteUrl = escapeHtml(inviteUrl);
  const safeWorkspaceName = escapeHtml(workspaceName);
  const safeInvitedByName = escapeHtml(invitedByName);

  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem 0;">
      <h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem;">You've been invited to ${safeWorkspaceName}</h2>
      <p style="color: #52525b; line-height: 1.6; margin: 0 0 1.5rem;">
        ${safeInvitedByName} has invited you to join <strong>${safeWorkspaceName}</strong> on OpenDocs. Click the button below to accept the invitation. This link expires in 7 days.
      </p>
      <a href="${safeInviteUrl}" style="display: inline-block; background: #6941c6; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;">
        Accept Invitation
      </a>
      <p style="color: #a1a1aa; font-size: 0.85rem; line-height: 1.5; margin: 2rem 0 0;">
        If you weren't expecting this invitation, you can safely ignore this email.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0 1rem;" />
      <p style="color: #a1a1aa; font-size: 0.8rem; margin: 0;">${sentWithOpenDocsFooter("invite")}</p>
    </div>
  `;
}

export function signInCodeEmail(code: string): string {
  const safeCode = escapeHtml(code);
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem 0;">
      <h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem;">Your OpenDocs sign-in code</h2>
      <p style="color: #52525b; line-height: 1.6; margin: 0 0 1.5rem;">
        Paste this code into your agent or the OpenDocs sign-in page. It expires in 10 minutes.
      </p>
      <p style="font-family: Menlo, Consolas, monospace; font-size: 2rem; font-weight: 700; letter-spacing: 0.35rem; color: #18181b; margin: 0 0 1.5rem;">${safeCode}</p>
      <p style="color: #a1a1aa; font-size: 0.85rem; line-height: 1.5; margin: 2rem 0 0;">
        If you didn't ask for this, you can ignore this email. No account is created or changed until the code is used.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0 1rem;" />
      <p style="color: #a1a1aa; font-size: 0.8rem; margin: 0;">OpenDocs &middot; ${instanceHost()}</p>
    </div>
  `;
}

export function documentSharedEmail({
  docUrl,
  docTitle,
  sharedByName,
}: {
  docUrl: string;
  docTitle: string;
  sharedByName: string;
}): string {
  const safeUrl = escapeHtml(docUrl);
  const safeTitle = escapeHtml(docTitle);
  const safeSharedBy = escapeHtml(sharedByName);
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem 0;">
      <h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem;">${safeSharedBy} shared a document with you</h2>
      <p style="color: #52525b; line-height: 1.6; margin: 0 0 1.5rem;">
        <strong>${safeTitle}</strong> is waiting for you on OpenDocs. Sign in with this email address to read it.
      </p>
      <a href="${safeUrl}" style="display: inline-block; background: #6941c6; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;">
        Open document
      </a>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0 1rem;" />
      <p style="color: #a1a1aa; font-size: 0.8rem; margin: 0;">${sentWithOpenDocsFooter("share")}</p>
    </div>
  `;
}

/**
 * Sent to the workspace owner when a custom domain fails its scheduled DNS
 * check enough times in a row to stop serving (custom-domains/service.ts).
 */
export function customDomainMisconfiguredEmail({
  hostname,
  workspaceName,
  reason,
  settingsUrl,
}: {
  hostname: string;
  workspaceName: string;
  reason: string;
  settingsUrl: string;
}): string {
  const safeHostname = escapeHtml(hostname);
  const safeWorkspace = escapeHtml(workspaceName);
  const safeReason = escapeHtml(reason);
  const safeUrl = escapeHtml(settingsUrl);
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem 0;">
      <h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem;">${safeHostname} stopped working</h2>
      <p style="color: #52525b; line-height: 1.6; margin: 0 0 1rem;">
        The DNS records for <strong>${safeHostname}</strong>, the custom domain of <strong>${safeWorkspace}</strong>, failed three checks in a row, so OpenDocs stopped serving documents there. Links to it don't work until the records are fixed.
      </p>
      <p style="color: #52525b; line-height: 1.6; margin: 0 0 1.5rem;">${safeReason}</p>
      <a href="${safeUrl}" style="display: inline-block; background: #6941c6; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;">
        Open workspace settings
      </a>
      <p style="color: #a1a1aa; font-size: 0.85rem; line-height: 1.5; margin: 2rem 0 0;">
        Both records need to stay in place, including the TXT record. Once they're back, the domain starts working again by itself within six hours, or straight away when you click Check now. Your documents are still on opendocs.cc in the meantime.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0 1rem;" />
      <p style="color: #a1a1aa; font-size: 0.8rem; margin: 0;">OpenDocs &middot; ${instanceHost()}</p>
    </div>
  `;
}

export function passwordResetEmail(url: string): string {
  return `
    <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 0 auto; padding: 2rem 0;">
      <h2 style="font-size: 1.25rem; font-weight: 600; margin: 0 0 1rem;">Reset your password</h2>
      <p style="color: #52525b; line-height: 1.6; margin: 0 0 1.5rem;">
        We received a request to reset your OpenDocs password. Click the button below to choose a new one. This link expires in 1 hour.
      </p>
      <a href="${url}" style="display: inline-block; background: #6941c6; color: #fff; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 0.95rem;">
        Reset password
      </a>
      <p style="color: #a1a1aa; font-size: 0.85rem; line-height: 1.5; margin: 2rem 0 0;">
        If you didn't request this, you can safely ignore this email. Your password won't be changed.
      </p>
      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 2rem 0 1rem;" />
      <p style="color: #a1a1aa; font-size: 0.8rem; margin: 0;">OpenDocs &middot; ${instanceHost()}</p>
    </div>
  `;
}

/**
 * Welcome email sent once, on user creation. Goal: orient the new
 * user in 30 seconds and put one obvious next action in front of
 * them. We deliberately don't run a drip campaign. This is the
 * only onboarding email.
 *
 * The HTML below is intentionally verbose vs. the other templates
 * because welcome mail tends to land in inboxes that the user
 * actually opens (not Gmail's "Updates" tab) and is a first
 * impression, so we trade brevity for cross-client robustness:
 *
 *   - Full `<!doctype html>` + `<head>` + meta tags so Outlook
 *     renders the doc in standards mode rather than its quirks
 *     fallback. Without this, Outlook will collapse `margin` on
 *     paragraphs and break the visual rhythm.
 *   - Table-based layout (the only layout primitive Outlook
 *     consistently respects). Divs would render fine in Gmail and
 *     Apple Mail but Outlook on Windows would break the centering.
 *   - All styles inline. Gmail and a few corporate clients strip
 *     `<style>` blocks. The `<style>` we do include is purely
 *     defensive (image reset, link color baseline) and a no-op if
 *     the client strips it.
 *   - `mso-line-height-rule:exactly` and `-ms-text-size-adjust:none`
 *     to keep Outlook / iOS from auto-resizing or auto-spacing.
 *   - VML conditional comment for the bulletproof Outlook button.
 *     pure HTML buttons render as ugly skinny rectangles in older
 *     Outlooks. The VML rectangle is invisible to every other
 *     client.
 *   - Code block uses `font-family: Menlo, Consolas, monospace`
 *     and a soft background so it reads as a code snippet without
 *     needing CSS that some clients strip (no `<pre>` styling).
 *   - Hidden preheader text in the leading `<div>` controls what
 *     shows up in the inbox preview pane next to the subject.
 */
export function welcomeEmail({
  appUrl,
  recipientName,
}: {
  appUrl: string;
  recipientName?: string | null;
}): string {
  const dashboardUrl = `${appUrl.replace(/\/$/, "")}/dashboard`;
  const safeDashboardUrl = escapeHtml(dashboardUrl);
  // First name only. Last names in greetings read formal in a
  // product context. Trim and split on whitespace; fall back to a
  // generic greeting if the name is missing or just whitespace.
  const firstName = recipientName?.trim().split(/\s+/)[0] ?? "";
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="x-apple-disable-message-reformatting" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    <title>Welcome to OpenDocs</title>
    <style>
      /* Defensive only. Most clients strip <style>. Critical
         styling is inline. */
      body { margin: 0 !important; padding: 0 !important; background-color: #f5f5f5; }
      table { border-collapse: collapse !important; }
      img { border: 0; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
      a { color: #6941c6; }
      .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; mso-hide: all; }
      @media only screen and (max-width: 520px) {
        .container { width: 100% !important; }
        .px-mobile { padding-left: 24px !important; padding-right: 24px !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f5f5f5; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
    <div class="preheader">Turn Markdown into a shareable doc with one command.</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f5f5f5;">
      <tr>
        <td align="center" style="padding: 40px 16px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" class="container" style="width: 520px; max-width: 520px; background-color: #ffffff; border-radius: 12px; box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
            <tr>
              <td class="px-mobile" style="padding: 40px 40px 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <h1 style="margin: 0 0 16px; font-size: 22px; line-height: 28px; font-weight: 600; color: #18181b; mso-line-height-rule: exactly;">
                  Welcome to OpenDocs
                </h1>
                <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46; mso-line-height-rule: exactly;">
                  ${greeting}
                </p>
                <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46; mso-line-height-rule: exactly;">
                  Thanks for trying OpenDocs. It gives your Markdown files a clean URL, so you can share agent notes, specs, reports, and runbooks without moving them into another editor.
                </p>
              </td>
            </tr>

            <tr>
              <td class="px-mobile" style="padding: 16px 40px 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <p style="margin: 0 0 16px; font-size: 16px; line-height: 24px; color: #3f3f46; mso-line-height-rule: exactly;">
                  The fastest way to start is from your terminal:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f4f4f5; border-radius: 8px;">
                  <tr>
                    <td style="padding: 16px 20px; font-family: Menlo, Consolas, 'Liberation Mono', monospace; font-size: 13px; line-height: 22px; color: #18181b; mso-line-height-rule: exactly;">
                      npx @opendocs.cc/cli login --browser${isOpenDocsCc() ? "" : ` --api-url ${instanceApiUrl()}`}<br />
                      npx @opendocs.cc/cli publish path/to/file.md
                    </td>
                  </tr>
                </table>
                <p style="margin: 16px 0 0; font-size: 16px; line-height: 24px; color: #3f3f46; mso-line-height-rule: exactly;">
                  If you work with coding agents, this is the workflow we built for: let the agent write Markdown, then publish the finished doc with the CLI.
                </p>
                <p style="margin: 12px 0 0; font-size: 16px; line-height: 24px; color: #3f3f46; mso-line-height-rule: exactly;">
                  Prefer the browser? You can upload Markdown files from your dashboard too.
                </p>
              </td>
            </tr>

            <tr>
              <td class="px-mobile" align="center" style="padding: 24px 40px 32px;">
                <!--[if mso]>
                <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${safeDashboardUrl}" style="height:44px;v-text-anchor:middle;width:200px;" arcsize="18%" stroke="f" fillcolor="#7f56d9">
                  <w:anchorlock/>
                  <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:15px;font-weight:600;">Open dashboard</center>
                </v:roundrect>
                <![endif]-->
                <!--[if !mso]><!-- -->
                <a href="${safeDashboardUrl}" style="display: inline-block; background-color: #7f56d9; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 15px; line-height: 20px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; mso-line-height-rule: exactly;">
                  Open dashboard
                </a>
                <!--<![endif]-->
              </td>
            </tr>

            <tr>
              <td class="px-mobile" style="padding: 0 40px 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 0 0 16px;" />
                <p style="margin: 0; font-size: 12px; line-height: 18px; color: #a1a1aa; mso-line-height-rule: exactly;">
                  You're getting this because you signed up for OpenDocs. If that wasn't you, you can ignore this email.
                </p>
                <p style="margin: 12px 0 0; font-size: 12px; line-height: 18px; color: #a1a1aa; mso-line-height-rule: exactly;">
                  OpenDocs &middot; ${instanceHost()}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
