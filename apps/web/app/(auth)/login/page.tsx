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
  title: "Sign in",
  description: "Sign in to your OpenDocs account.",
  url: "https://opendocs.cc/login",
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

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const session = await getServerSession();
  const params = await searchParams;
  const redirectUrl = getSafeRedirect(typeof params.redirect === "string" ? params.redirect : undefined);
  // Part of an OAuth authorization (an app connecting over MCP)? Then stay
  // here even with a session: the app asked for a fresh sign-in.
  const oauthQuery = await verifiedOAuthQuery(params);
  const oauthClient = oauthQuery
    ? await getOAuthClientRecord(new URLSearchParams(oauthQuery).get("client_id") ?? "")
    : null;
  const connectingApp = oauthClient ? describeOAuthClient(oauthClient, new URLSearchParams(oauthQuery!).get("redirect_uri")).name : null;

  if (session && !oauthQuery) {
    const onboarding = await getOnboardingState(session.user.id);
    // If logged in and there's a redirect, honour it (only when onboarding is done)
    if (onboarding.completed && redirectUrl) {
      redirect(redirectUrl);
    }
    redirect(onboarding.completed ? "/dashboard" : "/onboarding");
  }

  // Preserve redirect param (or the OAuth flow) in the signup link
  const signupHref = oauthQuery
    ? `/signup?${oauthQuery}`
    : redirectUrl
      ? `/signup?redirect=${encodeURIComponent(redirectUrl)}`
      : "/signup";

  return (
    <AuthCard
      title={oauthQuery ? "Sign in to OpenDocs" : "Log in"}
      description={
        oauthQuery
          ? `${connectingApp ?? "An app"} wants to connect to your OpenDocs account. Sign in or create a free account to continue.`
          : "Welcome back! Please enter your details."
      }
      footer={
        <>
          <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
            Don&apos;t have an account?
          </p>
          <Link
            href={signupHref}
            className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
          >
            Sign up
          </Link>
        </>
      }
    >
      <AuthActions
        mode="login"
        providers={authConfig.providers}
        redirectUrl={redirectUrl}
        oauthQuery={oauthQuery}
      />
    </AuthCard>
  );
}
