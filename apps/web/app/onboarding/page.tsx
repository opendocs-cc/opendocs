import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { requireServerSession } from "@/lib/auth/session";
import { getOnboardingState } from "@/lib/workspaces/cached";
import { OnboardingWizard } from "@/components/onboarding-wizard";

// Onboarding can send people back where they came from, but only to a
// claim page (/claim/<token>), so the parameter can't become an open
// redirect.
function safeNextUrl(raw: string | undefined): string | null {
  return raw && /^\/claim\/[A-Za-z0-9_-]{8,128}$/.test(raw) ? raw : null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const [session, { next }] = await Promise.all([requireServerSession(), searchParams]);
  const nextUrl = safeNextUrl(next);

  // If there's a pending invite cookie, redirect to the route handler
  // that processes it (cookies can only be modified in Route Handlers)
  const cookieStore = await cookies();
  const inviteCookie = cookieStore.get("pending_invite_token");

  if (inviteCookie?.value) {
    redirect("/api/invite/accept");
  }

  const onboarding = await getOnboardingState(session.user.id);

  if (onboarding.completed) {
    redirect(nextUrl ?? "/dashboard");
  }

  const isInvitedUser = onboarding.hasWorkspace && !onboarding.hasUsername;

  return (
    <main className="min-h-screen bg-[#fafafa]">
      <div className="absolute left-8 top-8">
        <Link href="/">
          <Image src="/opendocs-logo.svg" alt="OpenDocs" width={138} height={26} priority />
        </Link>
      </div>
      <div className="flex items-start justify-center min-h-screen pt-16 pb-16 px-4">
        <OnboardingWizard
          isInvitedUser={isInvitedUser}
          initialEmail={session.user.email}
          initialName={session.user.name}
          nextUrl={nextUrl}
        />
      </div>
    </main>
  );
}
