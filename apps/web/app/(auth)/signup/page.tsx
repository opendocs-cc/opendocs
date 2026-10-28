import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { safeReturnPath } from "@opendocs/shared/custom-domains/urls";

import { AuthActions } from "@/components/auth-actions";
import { AuthCard } from "@/components/auth-card";
import { authConfig } from "@/lib/auth/config";
import { getServerSession } from "@/lib/auth/session";
import { verifiedOAuthQuery } from "@/lib/auth/oauth-verify";
import { buildPageMetadata } from "@/lib/metadata";
import { describeOAuthClient, getOAuthClientRecord } from "@opendocs/shared/mcp/connections";
import { getOnboardingState } from "@/lib/workspaces/cached";

export const metadata: Metadata = buildPageMetadata({
  title: "Sign up",
  description:
    "Create your free OpenDocs account and start publishing Markdown.",
  url: "https://opendocs.cc/signup",
});

/**
 * Validate the redirect param is a safe internal path (starts with "/", no
 * protocol or double-slash that could be used for open-redirect attacks).
 */
function getSafeRedirect(raw: string | undefined): string | null {
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  // The shared check: a relative path only, with no "//", backslashes or
  // control characters (browsers drop tabs and newlines, which would turn
  // "/\t/evil.com" into "//evil.com").
  return safeReturnPath(decoded);
}

type SignupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const signupsDisabled = process.env.SIGNUPS_DISABLED === "true";
  const params = await searchParams;
  const redirectUrl = getSafeRedirect(typeof params.redirect === "string" ? params.redirect : undefined);
  // Part of an OAuth authorization (an app connecting over MCP)?
  const oauthQuery = await verifiedOAuthQuery(params);
  const oauthClient = oauthQuery
    ? await getOAuthClientRecord(new URLSearchParams(oauthQuery).get("client_id") ?? "")
    : null;
  const connectingApp = oauthClient ? describeOAuthClient(oauthClient, new URLSearchParams(oauthQuery!).get("redirect_uri")).name : null;

  if (signupsDisabled) {
    // Preserve redirect param in the login link
    const loginHref = redirectUrl
      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
      : "/login";

    return (
      <AuthCard
        title="Signups are paused"
        description="We're getting everything ready. Signups will open soon."
        footer={
          <>
            <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
              Already have an account?
            </p>
            <Link
              href={loginHref}
              className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
            >
              Log in
            </Link>
          </>
        }
      >
        <p className="text-[#A3A3A3] text-center py-4">Check back shortly.</p>
      </AuthCard>
    );
  }

  const session = await getServerSession();

  if (session && !oauthQuery) {
    const onboarding = await getOnboardingState(session.user.id);
    if (onboarding.completed && redirectUrl) {
      redirect(redirectUrl);
    }
    redirect(onboarding.completed ? "/dashboard" : "/onboarding");
  }

  // Preserve redirect param (or the OAuth flow) in the login link
  const loginHref = oauthQuery
    ? `/login?${oauthQuery}`
    : redirectUrl
      ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
      : "/login";

  return (
    <AuthCard
      title={oauthQuery ? "Create your OpenDocs account" : "Sign up"}
      description={
        oauthQuery
          ? `${connectingApp ?? "An app"} wants to connect to OpenDocs. Create a free account to continue.`
          : "Start with GitHub, Google, or email and then claim your username and workspace."
      }
      footer={
        <>
          <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
            Already have an account?
          </p>
          <Link
            href={loginHref}
            className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
          >
            Log in
          </Link>
        </>
      }
    >
      <AuthActions
        mode="signup"
        providers={authConfig.providers}
        redirectUrl={redirectUrl}
        oauthQuery={oauthQuery}
      />
    </AuthCard>
  );
}
