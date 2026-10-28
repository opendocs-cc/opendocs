import Link from "next/link";

import { Lock } from "lucide-react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { PublicSiteFooter } from "@/components/public-site-footer";
import { PublicSiteHeader } from "@/components/public-site-header";
import { getReaderSession } from "@/lib/auth/session";
import { getPublicUserMenuData } from "@/lib/public-user-menu";
import { getSiteContext } from "@/lib/site-context";
import { customSignInHref, isCustomSite, workspaceHref } from "@/lib/site-paths";

import "@/app/landing.css";

type RestrictedPostViewProps = {
  /**
   * Absolute path (starting with `/`) of the post that the viewer
   * tried to reach. Round-tripped through `/login?redirect=...` so
   * a successful sign-in drops the reader straight on the article
   * instead of their dashboard.
   */
  redirectPath: string;
  /**
   * What kind of private resource the viewer tried to open. Defaults
   * to document to preserve the existing article-link behavior.
   */
  resource?: "document" | "project";
  /**
   * Whether the viewer is already signed in. Flips the copy from
   * "sign in" to "this account doesn't have access" so a logged-in
   * user bouncing off a private or workspace-only post isn't told to
   * do something they've already done.
   */
  isViewerSignedIn: boolean;
};

/**
 * Rendered when a published post exists but the current viewer
 * can't see it (private or workspace-only, and they're not a member).
 *
 * Logged-out viewers get a sign-in CTA with a redirect back to the
 * post so shared links to private docs keep working for people who
 * have access but just aren't logged in yet — previously this was
 * indistinguishable from a 404, which made "send me that doc" links
 * frustrating to follow.
 *
 * Logged-in viewers get a softer "this account doesn't have access"
 * message instead, since re-logging won't change the outcome.
 */
export async function RestrictedPostView({
  redirectPath,
  resource = "document",
  isViewerSignedIn,
}: RestrictedPostViewProps) {
  const site = await getSiteContext();
  const loginHref = isCustomSite(site)
    ? customSignInHref(workspaceHref(site, redirectPath))
    : `/login?redirect=${encodeURIComponent(redirectPath)}`;
  const copy =
    resource === "project"
      ? {
          noAccessTitle: "You don't have access to this project",
          signInTitle: "Sign in to view this project",
          noAccessBody:
            "This project belongs to a private workspace. If you think you should be able to see it, ask the workspace owner to invite you.",
          signInBody:
            "This project belongs to a private workspace. If you have access, sign in and we'll take you straight back here.",
        }
      : {
          noAccessTitle: "You don't have access to this document",
          signInTitle: "Sign in to view this document",
          noAccessBody:
            "This document isn't public: only its workspace, or people it was shared with, can open it. If it was shared with you, sign in with that email address. Otherwise, ask the workspace owner for access.",
          signInBody:
            "This document isn't public. If you're a member of its workspace, or it was shared with your email address, sign in and we'll take you straight back here.",
        };

  // On a custom domain the page keeps the workspace's header and footer.
  if (isCustomSite(site)) {
    // Signed in but without access: the account menu lets the reader sign
    // out of this domain and try another account.
    const reader = isViewerSignedIn ? await getReaderSession() : null;
    const userMenu = reader ? await getPublicUserMenuData(reader.user) : null;
    return (
      <div className="flex min-h-screen flex-col bg-white text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100">
        <PublicSiteHeader isViewerSignedIn={isViewerSignedIn} userMenu={userMenu} />
        <main className="flex flex-1 flex-col items-center justify-center px-4 py-20 sm:px-8">
          <div className="mx-auto w-full max-w-md text-center">
            <div
              aria-hidden="true"
              className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100 ring-1 ring-zinc-900/[0.06] dark:bg-zinc-900 dark:ring-white/10"
            >
              <Lock className="h-5 w-5 text-zinc-500" strokeWidth={1.75} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-balance text-zinc-950 sm:text-3xl dark:text-white">
              {isViewerSignedIn ? copy.noAccessTitle : copy.signInTitle}
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm text-pretty text-zinc-600 sm:text-base dark:text-zinc-400">
              {isViewerSignedIn ? copy.noAccessBody : copy.signInBody}
            </p>
            <div className="mx-auto mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              {isViewerSignedIn ? null : (
                <a
                  href={loginHref}
                  className="inline-flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  Sign in
                </a>
              )}
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-full bg-white px-5 text-sm font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-900/10 transition hover:text-zinc-950 hover:ring-zinc-900/20 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/10"
              >
                Back to {site.workspaceName}
              </Link>
            </div>
          </div>
        </main>
        <PublicSiteFooter />
      </div>
    );
  }

  return (
    <div className="lp">
      <LandingNav authenticated={isViewerSignedIn} />

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "8rem 2rem 4rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: "72px",
            height: "72px",
            borderRadius: "50%",
            background: "#f4f4f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1.5rem",
          }}
          aria-hidden="true"
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#6B3FC9"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <h1
          style={{
            fontSize: "1.75rem",
            fontWeight: 700,
            margin: "0 0 0.75rem",
            color: "#18181b",
          }}
        >
          {isViewerSignedIn ? copy.noAccessTitle : copy.signInTitle}
        </h1>
        <p
          style={{
            fontSize: "1rem",
            color: "#52525b",
            maxWidth: "32rem",
            margin: "0 0 2rem",
            lineHeight: 1.6,
          }}
        >
          {isViewerSignedIn ? copy.noAccessBody : copy.signInBody}
        </p>

        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {isViewerSignedIn ? (
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                background: "#6B3FC9",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.9375rem",
                textDecoration: "none",
              }}
            >
              Back to dashboard
            </Link>
          ) : (
            <Link
              href={loginHref}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                background: "#6B3FC9",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.9375rem",
                textDecoration: "none",
              }}
            >
              Sign in
            </Link>
          )}
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "0.75rem 1.5rem",
              borderRadius: "0.5rem",
              background: "#fff",
              color: "#27272a",
              fontWeight: 600,
              fontSize: "0.9375rem",
              textDecoration: "none",
              boxShadow: "inset 0 0 0 1px #e4e4e7",
            }}
          >
            Back to OpenDocs
          </Link>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
