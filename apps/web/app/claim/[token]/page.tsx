import type { Metadata } from "next";
import Link from "next/link";

import { getAnonymousDocByClaimToken } from "@opendocs/shared/anonymous/service";
import { getOnboardingState, getUserWorkspaces } from "@opendocs/shared/workspaces/service";
import { LandingNav } from "@/components/landing-nav";
import { getServerSession } from "@/lib/auth/session";
import { claimAnonymousDocAction } from "./actions";

import "@/app/landing.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Keep this document",
  robots: { index: false, follow: false, nocache: true },
};

type ClaimPageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
};

const ERRORS: Record<string, string> = {
  limit: "That workspace has reached its plan's document limit. Pick another workspace or upgrade.",
  expired: "This document expired before it could be claimed.",
  not_found: "This document was already claimed or has expired.",
  hidden: "Readers reported this document, so it can't be claimed while it's under review.",
  failed: "Something went wrong while claiming. Try again.",
};

const cardStyle = {
  maxWidth: "32rem",
  margin: "0 auto",
  border: "1px solid #E4E4E7",
  borderRadius: "1rem",
  padding: "2rem",
  background: "#fff",
  textAlign: "left" as const,
};

export default async function ClaimPage({ params, searchParams }: ClaimPageProps) {
  const [{ token }, { error }, session] = await Promise.all([params, searchParams, getServerSession()]);
  const doc = await getAnonymousDocByClaimToken(token);
  const here = `/claim/${encodeURIComponent(token)}`;

  let body: React.ReactNode;
  if (!doc) {
    body = (
      <>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          This link has expired
        </h1>
        <p style={{ color: "#52525B", lineHeight: 1.6 }}>
          Anonymous documents last 24 hours and can be claimed once. Publish it again, then sign in
          to keep it.
        </p>
      </>
    );
  } else if (doc.hidden) {
    body = (
      <>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          This document is under review
        </h1>
        <p style={{ color: "#52525B", lineHeight: 1.6 }}>
          Readers reported it, so it&apos;s hidden and can&apos;t be claimed until we&apos;ve looked at
          it.
        </p>
      </>
    );
  } else if (!session) {
    body = (
      <>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Keep &ldquo;{doc.title}&rdquo;
        </h1>
        <p style={{ color: "#52525B", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          Sign in or create a free account and this document moves into your workspace, private to
          your team. It expires otherwise.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <Link href={`/signup?redirect=${encodeURIComponent(here)}`} className="lp-btn-gradient lp-btn-gradient--lg">
            Create an account
          </Link>
          <Link href={`/login?redirect=${encodeURIComponent(here)}`} className="lp-btn-ghost">
            Sign in
          </Link>
        </div>
      </>
    );
  } else {
    const onboarding = await getOnboardingState(session.user.id);
    const workspaces = onboarding.completed ? await getUserWorkspaces(session.user.id) : [];
    body = !onboarding.completed ? (
      <>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Finish setting up first
        </h1>
        <p style={{ color: "#52525B", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          Create your workspace and we&apos;ll bring you back here to keep the document.
        </p>
        <Link href={`/onboarding?next=${encodeURIComponent(here)}`} className="lp-btn-gradient lp-btn-gradient--lg">
          Set up workspace
        </Link>
      </>
    ) : (
      <form action={claimAnonymousDocAction}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, marginBottom: "0.75rem" }}>
          Keep &ldquo;{doc.title}&rdquo;
        </h1>
        <p style={{ color: "#52525B", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          It becomes a normal document in your workspace. The anonymous link stops working.
        </p>
        <input type="hidden" name="claimToken" value={token} />
        <label style={{ display: "block", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
          Workspace
        </label>
        <select
          name="workspaceId"
          defaultValue={onboarding.workspace?.id}
          style={{ width: "100%", padding: "0.6rem", border: "1px solid #D4D4D8", borderRadius: "0.5rem", marginBottom: "1rem" }}
        >
          {workspaces.map((ws) => (
            <option key={ws.workspaceId} value={ws.workspaceId}>
              {ws.name} (opendocs.cc/{ws.slug})
            </option>
          ))}
        </select>
        <label style={{ display: "block", fontWeight: 600, fontSize: "0.9rem", marginBottom: "0.4rem" }}>
          Who can read it
        </label>
        <select
          name="visibility"
          defaultValue="workspace"
          style={{ width: "100%", padding: "0.6rem", border: "1px solid #D4D4D8", borderRadius: "0.5rem", marginBottom: "1.5rem" }}
        >
          <option value="workspace">Everyone in the workspace</option>
          <option value="private">Only me</option>
        </select>
        <button type="submit" className="lp-btn-gradient lp-btn-gradient--lg">
          Keep this document
        </button>
      </form>
    );
  }

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />
      <main style={{ flex: 1, padding: "8rem 1.25rem 4rem" }}>
        <div style={cardStyle}>
          {error && ERRORS[error] ? (
            <p style={{ color: "#B42318", marginBottom: "1rem", fontSize: "0.9rem" }}>{ERRORS[error]}</p>
          ) : null}
          {body}
        </div>
      </main>
    </div>
  );
}
