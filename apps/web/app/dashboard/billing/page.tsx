import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@opendocs/shared/db";
import { user, workspaceMembers, workspaces } from "@opendocs/shared/db/schema";
import { getEffectiveWorkspaceTier } from "@opendocs/shared/workspaces/service";

import { requireServerSession } from "@/lib/auth/session";
import {
  getWorkspaceSettings,
  getUserWorkspaces,
  getOwnedWorkspaceUniqueMemberCount,
} from "@/lib/workspaces/cached";
import { getBillingState, getOtherTeamWorkspaces } from "@/lib/billing/state";
import { isBillingEnabled } from "@/lib/billing/config";
import { getFounderOfferView } from "@/lib/billing/founder-offer";
import { BillingManagedByOwner } from "./managed-by-owner";
import {
  getInvoices,
  getPaymentMethodSummary,
  getPortalUpdatePaymentUrl,
} from "@/lib/billing/paddle-data";

export const metadata: Metadata = { title: "Billing" };

const BillingClient = dynamic(
  () =>
    import("./billing-client").then((mod) => ({ default: mod.BillingClient })),
  {
    loading: () => (
      <div className="w-full min-h-full">
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
          <div className="flex flex-col gap-0.5">
            <div className="h-[30px] bg-gray-100 rounded w-40 animate-pulse" />
            <div className="h-[24px] bg-gray-100 rounded w-80 animate-pulse mt-2" />
          </div>
          <div className="animate-pulse grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="h-64 bg-white rounded-xl border border-[#e5e5e5]" />
            <div className="h-64 bg-white rounded-xl border border-[#e5e5e5]" />
          </div>
          <div className="h-64 bg-white rounded-xl border border-[#e5e5e5] animate-pulse" />
        </div>
      </div>
    ),
  },
);

export default async function BillingPage() {
  const session = await requireServerSession();

  // Resolve active workspace from cookie
  const cookieStore = await cookies();
  const activeWsCookie = cookieStore.get("active_workspace_id")?.value;
  const allWorkspaces = await getUserWorkspaces(session.user.id);
  const activeWorkspaceId =
    activeWsCookie &&
    allWorkspaces.some((w) => w.workspaceId === activeWsCookie)
      ? activeWsCookie
      : allWorkspaces[0]?.workspaceId;

  const settings = await getWorkspaceSettings(
    session.user.id,
    activeWorkspaceId,
  );

  if (!settings || settings.role === "member") {
    redirect("/dashboard");
  }

  // A workspace's plan comes from its owner's account, so only the owner
  // can change it. Admins see what the workspace is on and who manages it.
  if (settings.role !== "owner") {
    const [tier, owner] = await Promise.all([
      getEffectiveWorkspaceTier(settings.id),
      db
        ? db
            .select({ name: user.name, email: user.email })
            .from(workspaces)
            .innerJoin(user, eq(user.id, workspaces.ownerUserId))
            .where(eq(workspaces.id, settings.id))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
    ]);
    return (
      <BillingManagedByOwner
        workspaceName={settings.name}
        tier={tier ?? "free"}
        ownerName={owner?.name || owner?.email || "the workspace owner"}
        ownerEmail={owner?.email ?? null}
      />
    );
  }

  const billingState = await getBillingState(session.user.id, settings.id);
  const sub = billingState.subscription;

  // Fan out Paddle reads + member count + "other Team workspaces I own"
  // in parallel. Each is graceful on failure (returns null/[]) so a
  // Paddle outage doesn't hide the page — the user can still see their
  // plan and open the change-plan modal. The other-team-workspaces query
  // powers the "You already own Team on X" banner; it's a tiny indexed
  // read so it rides alongside.
  const [
    paymentMethod,
    invoices,
    portalUpdateUrl,
    memberCountRows,
    otherTeamWorkspaces,
    founderOffer,
  ] = await Promise.all([
    sub
      ? getPaymentMethodSummary(sub.paddleCustomerId, sub.paddleSubscriptionId)
      : Promise.resolve(null),
    sub ? getInvoices(sub.paddleCustomerId, 10) : Promise.resolve([]),
    sub
      ? getPortalUpdatePaymentUrl(
          sub.paddleCustomerId,
          sub.paddleSubscriptionId,
        )
      : Promise.resolve(null),
    db
      ? db
          .select({ c: sql<number>`count(*)::int` })
          .from(workspaceMembers)
          .where(
            and(
              eq(workspaceMembers.workspaceId, settings.id),
              eq(workspaceMembers.status, "active"),
            ),
          )
      : Promise.resolve([{ c: 1 }]),
    getOtherTeamWorkspaces(session.user.id, settings.id),
    getFounderOfferView(),
  ]);

  const activeWorkspaceMemberCount = memberCountRows[0]?.c ?? 1;
  const seatFloor = await getOwnedWorkspaceUniqueMemberCount(session.user.id);
  const memberCount =
    billingState.effectivePlan === "team" ? seatFloor : activeWorkspaceMemberCount;

  return (
    <BillingClient
      billingEnabled={isBillingEnabled()}
      billingState={billingState}
      workspaceId={settings.id}
      workspaceName={settings.name}
      paymentMethod={paymentMethod}
      invoices={invoices}
      portalUpdateUrl={portalUpdateUrl}
      memberCount={memberCount}
      seatFloor={seatFloor}
      userEmail={session.user.email}
      otherTeamWorkspaces={otherTeamWorkspaces}
      founderOffer={founderOffer}
    />
  );
}
