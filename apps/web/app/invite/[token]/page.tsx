import { redirect } from "next/navigation";
import Link from "next/link";

import { getServerSession } from "@/lib/auth/session";
import { acceptInvitation, getInvitationLandingState } from "@/lib/workspaces/cached";
import { InviteSignOutButton } from "./invite-sign-out-button";

type InvitePageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: InvitePageProps) {
  const { token } = await params;
  const invitePath = `/invite/${token}`;
  const inviteState = await getInvitationLandingState(token);

  if (inviteState.status !== "valid") {
    const info =
      inviteState.status === "expired"
        ? {
            title: "Invitation expired",
            message:
              "This invitation link has expired. Please ask your team admin to send a new one.",
          }
        : {
            title: "Invitation not found",
            message:
              "This invitation link is invalid or has already been used.",
          };

    return (
      <main
        className="od-shell"
        style={{
          padding: "6rem 0",
          textAlign: "center",
          maxWidth: "28rem",
          margin: "0 auto",
        }}
      >
        <h1 style={{ marginBottom: "0.5rem" }}>{info.title}</h1>
        <p className="od-muted" style={{ marginBottom: "1.5rem" }}>
          {info.message}
        </p>
        <Link
          href="/"
          style={{ color: "var(--od-accent)", fontWeight: 600 }}
        >
          Go to homepage
        </Link>
      </main>
    );
  }

  const session = await getServerSession();

  // Not logged in — redirect to route handler that sets the cookie
  if (!session) {
    redirect(`/api/invite/${token}`);
  }

  // Logged in — try to accept the invitation
  const result = await acceptInvitation(session.user.id, token);

  if ("error" in result) {
    const errorMessages: Record<string, { title: string; message: string }> = {
      expired: {
        title: "Invitation expired",
        message:
          "This invitation link has expired. Please ask your team admin to send a new one.",
      },
      not_found: {
        title: "Invitation not found",
        message:
          "This invitation link is invalid or has already been used.",
      },
      billing_failed: {
        title: "Seat update failed",
        message:
          "We couldn't update billing for this team seat. Please ask your team admin to try again.",
      },
      member_limit: {
        title: "Workspace member limit reached",
        message:
          "This workspace has reached its member limit. Please ask a workspace admin to upgrade before accepting this invite.",
      },
      forbidden: {
        title: "Wrong account",
        message: `This invite was sent to ${inviteState.email}. You're signed in as ${session.user.email}. Sign out, then sign in with the invited email to accept it.`,
      },
    };

    const info = errorMessages[result.error as string] ?? {
      title: "Something went wrong",
      message:
        "We couldn't process this invitation. Please try again or contact the team admin.",
    };

    return (
      <main
        className="od-shell"
        style={{
          padding: "6rem 0",
          textAlign: "center",
          maxWidth: "28rem",
          margin: "0 auto",
        }}
      >
        <h1 style={{ marginBottom: "0.5rem" }}>{info.title}</h1>
        <p className="od-muted" style={{ marginBottom: "1.5rem" }}>
          {info.message}
        </p>
        {result.error === "forbidden" ? (
          <div
            style={{
              alignItems: "center",
              display: "flex",
              flexDirection: "column",
              gap: "0.875rem",
            }}
          >
            <InviteSignOutButton invitePath={invitePath} />
            <Link
              href="/dashboard"
              style={{ color: "var(--od-accent)", fontWeight: 600 }}
            >
              Stay in current account
            </Link>
          </div>
        ) : (
          <Link
            href="/"
            style={{ color: "var(--od-accent)", fontWeight: 600 }}
          >
            Go to homepage
          </Link>
        )}
      </main>
    );
  }

  // Accepted. Pages can't set cookies, so /dashboard/open makes the
  // workspace active; the dashboard sends anyone mid-onboarding there.
  redirect(
    result.workspaceId
      ? `/dashboard/open?workspace=${encodeURIComponent(result.workspaceId)}`
      : "/dashboard",
  );
}
