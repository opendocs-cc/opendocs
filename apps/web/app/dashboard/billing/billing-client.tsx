"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PageHeader } from "@/components/dashboard/page-header";
import { PLAN_PRICES } from "@/lib/plan-prices";
import {
  Check,
  CreditCard,
  Download,
  FileText,
  Info,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { trackEvent } from "@/lib/analytics";
import {
  trackAdCheckoutStarted,
  trackAdPurchase,
} from "@/lib/ad-tracking/client";
import {
  cancelSubscriptionAction,
  changeSubscriptionAction,
  getBillingSnapshotAction,
  getInvoiceDownloadUrlAction,
  resumeSubscriptionAction,
  startCheckoutAction,
  type ChangeSubscriptionInput,
  type StartCheckoutInput,
} from "@/lib/billing/actions";
import { openCheckout } from "@/lib/billing/checkout";
import {
  FOUNDER_PRO_PRICES,
  PRO_PRICES,
  formatOfferEnd,
  useFounderOfferOpen,
  type FounderOfferView,
} from "@/lib/billing/founder-offer-display";
import type { BillingState, OtherTeamWorkspace } from "@/lib/billing/state";
import type {
  InvoiceSummary,
  PaymentMethodSummary,
} from "@/lib/billing/paddle-data";
import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";

type BillingCycle = "monthly" | "yearly";
type PlanType = "free" | "pro" | "team";

type Plan = {
  name: string;
  type: PlanType;
  monthlyPrice: number;
  yearlyPrice: number;
  tagline: string;
  recommended?: boolean;
  perUser?: boolean;
  minSeats?: number;
  /** Max active members per workspace; null means unlimited. */
  memberLimit: number | null;
  features: string[];
};

const TEAM_MIN_SEATS = PLAN_PRICES.team.minSeats;

const plans: Plan[] = [
  {
    name: "Free",
    type: "free",
    monthlyPrice: 0,
    yearlyPrice: 0,
    memberLimit: PLAN_LIMITS.free.membersPerWorkspace,
    tagline: "For trying out the full workflow",
    features: [
      "50 published documents",
      "1 workspace, 3 members",
      "Public publishing",
      "PDF export (with OpenDocs footer)",
      "Export branding (logo, colors, fonts)",
      "API keys & CLI access",
      "Version history",
    ],
  },
  {
    name: "Pro",
    type: "pro",
    monthlyPrice: PLAN_PRICES.pro.monthly,
    yearlyPrice: PLAN_PRICES.pro.yearly,
    memberLimit: PLAN_LIMITS.pro.membersPerWorkspace,
    recommended: true,
    tagline: "For solo creators and small teams",
    features: [
      "Unlimited documents",
      "2 workspaces, up to 5 members each",
      "PDF & Word (.docx) export",
      'Your own export footer, no "Made with OpenDocs"',
      "A custom domain for each workspace",
      "API keys & CLI access",
      "Email support",
    ],
  },
  {
    name: "Team",
    type: "team",
    monthlyPrice: PLAN_PRICES.team.monthlyPerSeat,
    yearlyPrice: PLAN_PRICES.team.yearlyPerSeat,
    perUser: true,
    minSeats: TEAM_MIN_SEATS,
    memberLimit: null, // seats-based; limit is the subscription seat count
    tagline: "For growing teams with shared workspaces",
    features: [
      "Everything in Pro",
      "Unlimited workspaces & members",
      "One bill for the whole team",
      "Priority support",
    ],
  },
];

function formatDate(d: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatExpiry(month: number, year: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

/**
 * Humanize a list of workspace names for the "You already own Team on …"
 * banner. Keeps the first two names in-line so the message reads naturally
 * for the common case (1-2 other workspaces) and collapses the tail into
 * "N others" for owners with long lists.
 */
function formatWorkspaceNames(items: OtherTeamWorkspace[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!.name;
  if (items.length === 2) return `${items[0]!.name} and ${items[1]!.name}`;
  const rest = items.length - 2;
  return `${items[0]!.name}, ${items[1]!.name}, and ${rest} other${
    rest === 1 ? "" : "s"
  }`;
}

// ---------------------------------------------------------------------------
// Card-brand glyphs. We inline Visa + Mastercard SVGs (covers ~90% of cards
// in production); everything else falls back to the lucide CreditCard. Keeps
// the bundle lean vs. pulling a dedicated card-logo library.
// ---------------------------------------------------------------------------

function VisaGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="48" height="32" rx="4" fill="#1A1F71" />
      <path
        d="M18.1 20.7l1.6-9.5h2.6l-1.6 9.5h-2.6zM30 11.3c-.5-.2-1.3-.4-2.4-.4-2.6 0-4.5 1.3-4.5 3.3 0 1.4 1.3 2.2 2.4 2.7 1 .4 1.4.7 1.4 1.1 0 .6-.8.9-1.5.9-1 0-1.6-.1-2.4-.5l-.3-.1-.4 2.2c.6.3 1.8.5 3 .5 2.8 0 4.7-1.3 4.7-3.4 0-1.1-.7-2-2.3-2.7-1-.5-1.6-.8-1.6-1.2 0-.4.5-.8 1.5-.8.9 0 1.5.2 1.9.4l.2.1.3-2.1zM34 17.5c.2-.5.9-2.5.9-2.5 0 0 .2-.5.3-.8l.2.7s.5 2 .6 2.5l-2 .1zm2.9-6.3H35c-.6 0-1 .2-1.3.8l-3.8 8.7h2.7s.4-1.2.5-1.4h3.3c.1.3.3 1.4.3 1.4h2.4l-2.1-9.5zM16.5 11.3l-2.5 6.4-.3-1.3c-.5-1.5-1.9-3.2-3.6-4l2.3 8.3h2.7l4-9.4h-2.6z"
        fill="#fff"
      />
      <path
        d="M11.4 11.3H7.3l-.1.2c3.3.8 5.4 2.8 6.3 5.3l-.9-4.7c-.2-.6-.6-.8-1.2-.8z"
        fill="#F7B600"
      />
    </svg>
  );
}

function MastercardGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <rect width="48" height="32" rx="4" fill="#fff" stroke="#E5E5E5" />
      <circle cx="20" cy="16" r="7" fill="#EB001B" />
      <circle cx="28" cy="16" r="7" fill="#F79E1B" />
      <path
        d="M24 10.5a7 7 0 010 11 7 7 0 010-11z"
        fill="#FF5F00"
      />
    </svg>
  );
}

function CardBrandGlyph({
  brand,
  className,
}: {
  brand: string;
  className?: string;
}) {
  if (brand === "visa") return <VisaGlyph className={className} />;
  if (brand === "mastercard") return <MastercardGlyph className={className} />;
  return <CreditCard className={className} strokeWidth={1.5} />;
}

export interface BillingClientProps {
  billingEnabled: boolean;
  billingState: BillingState;
  workspaceId: string;
  workspaceName: string;
  paymentMethod: PaymentMethodSummary | null;
  invoices: InvoiceSummary[];
  /** Signed URL to Paddle's hosted "update payment method" page. Null if
   *  there's no subscription, or if the portal session failed to create. */
  portalUpdateUrl: string | null;
  memberCount: number;
  /** Unique active members across every workspace this user owns: the fewest Team seats they can buy. */
  seatFloor: number;
  userEmail: string;
  /** Other workspaces this user already pays Team for. Drives the context
   *  banner at the top of the page — empty list = no banner. */
  otherTeamWorkspaces: OtherTeamWorkspace[];
  /** The open founding-member offer, from the server. */
  founderOffer: FounderOfferView | null;
}

type ActivationState = "idle" | "pending" | "confirmed";

export function BillingClient({
  billingEnabled,
  billingState,
  workspaceId,
  workspaceName,
  paymentMethod,
  invoices,
  portalUpdateUrl,
  memberCount,
  seatFloor,
  userEmail,
  otherTeamWorkspaces,
  founderOffer,
}: BillingClientProps) {
  const router = useRouter();
  const currentPlan = billingState.effectivePlan;
  const sub = billingState.subscription;
  const hasFounderAccess = billingState.compedTier === "friends";
  const hasCreatorAccess = billingState.compedTier === "creator";
  const currentPlanData = plans.find((p) => p.type === currentPlan)!;

  // Founding-member pricing on Pro: a new checkout while the offer is
  // open, or a founding member's own subscription (back on Pro from Team,
  // the discount is put back). Everyone else sees the regular price.
  const founderOfferOpen = useFounderOfferOpen(founderOffer);
  const proAtFounderPrice = sub
    ? sub.founderPrice || sub.foundingMember
    : founderOfferOpen;

  // Initialize the modal's controls from the current subscription (if
  // any) so opening the modal on Pro Yearly shows "Pro · Yearly" pre-
  // selected — not the defaults. Team seat count same idea.
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(
    sub?.billingCycle ?? "monthly",
  );
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanType>(
    currentPlan === "free" ? "pro" : currentPlan,
  );
  const minTeamSeats = Math.max(TEAM_MIN_SEATS, seatFloor);
  const [teamSeats, setTeamSeats] = useState<number>(
    sub?.plan === "team" ? Math.max(sub.seats, minTeamSeats) : minTeamSeats,
  );
  const [isCheckoutLoading, startCheckoutTransition] = useTransition();

  // Cancel-subscription flow. Triggered by selecting Free in the plan
  // modal and hitting "Downgrade to Free" — pops a second confirmation
  // modal that requires a checkbox before firing the API call.
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelAcknowledged, setCancelAcknowledged] = useState(false);
  const [isCanceling, startCancelTransition] = useTransition();

  // Resume flow — undoes a pending cancel by clearing Paddle's
  // scheduledChange. Surfaced from the banner inside the plan modal
  // when sub.cancelAtPeriodEnd is true.
  const [isResuming, startResumeTransition] = useTransition();

  // Tracks which invoice row is currently fetching its PDF URL — so we
  // can disable just that button and show a spinner inline without a
  // global overlay.
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<
    string | null
  >(null);

  // Post-checkout activation state. Paddle redirects us to
  // /dashboard/billing?success=1; we show a modal overlay while we poll
  // for the webhook-driven plan change, then celebrate the upgrade.
  const [activationState, setActivationState] =
    useState<ActivationState>("idle");
  const [confirmedPlan, setConfirmedPlan] = useState<"pro" | "team" | null>(
    null,
  );

  // Fire confetti when the activation flow confirms. Dynamic-imported so
  // the ~10KB library doesn't ride along in the initial billing-client
  // bundle — only users who actually complete a checkout pay for it.
  useEffect(() => {
    if (activationState !== "confirmed") return;
    let cancelled = false;
    void import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#7F56D9", "#6941C6", "#027A48", "#ABEFC6"];
      confetti({
        particleCount: 90,
        spread: 80,
        startVelocity: 45,
        origin: { y: 0.55 },
        colors,
        disableForReducedMotion: true,
      });
      const end = Date.now() + 650;
      (function frame() {
        if (cancelled || Date.now() > end) return;
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors,
          disableForReducedMotion: true,
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors,
          disableForReducedMotion: true,
        });
        requestAnimationFrame(frame);
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [activationState]);

  // Handle the ?success=1 redirect. Mount-only on purpose — we don't want
  // the effect to re-run when we strip the query param, which is why we
  // read from window.location directly and pass an empty dep array.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("success") !== "1") return;

    // Strip the flag up front so a reload / back-nav doesn't re-trigger
    // the activation flow.
    const url = new URL(window.location.href);
    url.searchParams.delete("success");
    window.history.replaceState({}, "", url.toString());

    setActivationState("pending");

    const startedAt = Date.now();
    const MIN_PENDING_MS = 1_800;
    const POLL_INTERVAL_MS = 1_000;
    const POLL_TIMEOUT_MS = 20_000;

    let stopped = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      pollTimer = null;
      timeoutTimer = null;
    };

    const finish = async (
      outcome: { ok: true; plan: "pro" | "team" } | { ok: false },
    ) => {
      if (stopped) return;
      stopped = true;
      cleanup();

      router.refresh();

      const elapsed = Date.now() - startedAt;
      const wait = Math.max(0, MIN_PENDING_MS - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));

      if (outcome.ok) {
        setConfirmedPlan(outcome.plan);
        setActivationState("confirmed");
        toast.success("Subscription active!");
      } else {
        setActivationState("idle");
        toast.warning(
          "Still finalizing your subscription — refresh the page in a moment to see your new plan.",
        );
      }
    };

    const poll = async () => {
      try {
        const snapshot = await getBillingSnapshotAction(workspaceId);
        if (snapshot.plan !== "free" || snapshot.hasActiveSubscription) {
          const plan: "pro" | "team" =
            snapshot.plan === "team" ? "team" : "pro";
          void finish({ ok: true, plan });
        }
      } catch {
        // Transient — keep polling until timeout.
      }
    };

    void poll();
    pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    timeoutTimer = setTimeout(
      () => void finish({ ok: false }),
      POLL_TIMEOUT_MS,
    );

    return () => {
      stopped = true;
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Selecting exactly what the user already has — same plan type AND
  // same cycle AND (for Team) same seat count. Used to disable the
  // Continue button and hide the proration hint.
  const isSameAsCurrent = (() => {
    if (selectedPlan !== currentPlan) return false;
    if (hasFounderAccess && selectedPlan === "pro") return true;
    if (hasCreatorAccess && selectedPlan === "team") return true;
    if (!sub) return selectedPlan === "free";
    if (sub.billingCycle !== billingCycle) return false;
    if (selectedPlan === "team" && sub.seats !== teamSeats) return false;
    return true;
  })();

  const handleContinue = () => {
    if (!billingEnabled) {
      toast.error("Billing is currently disabled.");
      return;
    }
    if (selectedPlan === "free") {
      // "Downgrade to Free" = cancel at period end. Hand off to the
      // confirmation modal so we capture an explicit acknowledgement
      // before calling Paddle.
      if (!sub) {
        // Already on Free — button should have been disabled by
        // isSameAsCurrent, but guard anyway.
        return;
      }
      setIsUpgradeModalOpen(false);
      setCancelAcknowledged(false);
      setIsCancelModalOpen(true);
      return;
    }

    const input: ChangeSubscriptionInput =
      selectedPlan === "team"
        ? {
            plan: "team",
            cycle: billingCycle,
            workspaceId,
            seats: teamSeats,
          }
        : { plan: "pro", cycle: billingCycle };

    if (sub) {
      // In-place update — Paddle bills the saved card for the prorated
      // delta. No new checkout overlay, no card re-entry.
      setIsUpgradeModalOpen(false);
      startCheckoutTransition(async () => {
        setActivationState("pending");
        const startedAt = Date.now();
        const MIN_PENDING_MS = 1_200;

        trackEvent("Subscription Changed", {
          plan: selectedPlan,
          cycle: billingCycle,
        });

        const result = await changeSubscriptionAction(input);

        const elapsed = Date.now() - startedAt;
        const wait = Math.max(0, MIN_PENDING_MS - elapsed);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));

        if (!result.ok) {
          setActivationState("idle");
          toast.error(
            result.error === "owner_only"
              ? "Only this workspace's owner can change its plan."
              : result.error === "seats_below_members"
                ? `You have ${result.members} people across your workspaces, so Team needs at least ${result.members} seats.`
              : result.error === "workspace_limit_exceeded"
                ? "You own more workspaces than Pro includes. Add workspace capacity first or remove extra workspaces."
              : result.error === "no_active_subscription"
                ? "No active subscription to change."
                : result.error === "billing_disabled"
                  ? "Billing is currently disabled."
                  : "Couldn't update your plan. Try again in a moment.",
          );
          return;
        }

        router.refresh();
        setConfirmedPlan(selectedPlan === "team" ? "team" : "pro");
        setActivationState("confirmed");
      });
      return;
    }

    // No existing subscription — open fresh checkout for card entry.
    const checkoutInput: StartCheckoutInput = input;
    startCheckoutTransition(async () => {
      trackEvent("Subscription Started", {
        plan: selectedPlan,
        cycle: billingCycle,
      });
      trackAdCheckoutStarted({
        plan: selectedPlan,
        cycle: billingCycle,
      });
      const result = await startCheckoutAction(checkoutInput);
      if (!result.ok) {
        toast.error(
          result.error === "owner_only"
            ? "Only this workspace's owner can change its plan."
            : result.error === "seats_below_members"
              ? `You have ${result.members} people across your workspaces, so Team needs at least ${result.members} seats.`
            : result.error === "already_subscribed"
              ? "You already have a subscription. Refresh the page to change it instead."
            : result.error === "billing_disabled"
              ? "Billing is currently disabled."
              : "Couldn't start checkout. Try again in a moment.",
        );
        return;
      }
      setIsUpgradeModalOpen(false);
      try {
        await openCheckout({
          transactionId: result.data.transactionId,
          clientToken: result.data.clientToken,
          environment: result.data.environment,
          customerEmail: result.data.customerEmail,
          onComplete: () => {
            trackAdPurchase({
              eventId: `checkout:${result.data.transactionId}`,
            });
            router.refresh();
          },
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("[checkout] open failed:", error);
        toast.error("Couldn't open checkout. Please try again.");
      }
    });
  };

  const handleInvoiceDownload = async (invoiceId: string) => {
    if (downloadingInvoiceId) return;
    setDownloadingInvoiceId(invoiceId);
    try {
      const result = await getInvoiceDownloadUrlAction(invoiceId);
      if (!result.ok) {
        toast.error(
          result.error === "forbidden"
            ? "You don't have access to that invoice."
            : "Couldn't open the invoice. Try again in a moment.",
        );
        return;
      }
      // window.open lets the browser handle the PDF: most open inline,
      // some trigger a download. Either is fine for a signed URL that
      // will expire in ~30min.
      window.open(result.url, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const handleConfirmCancel = () => {
    if (!cancelAcknowledged || !sub) return;
    startCancelTransition(async () => {
      trackEvent("Subscription Canceled", {
        plan: currentPlan,
        cycle: sub.billingCycle,
      });
      const result = await cancelSubscriptionAction();
      if (!result.ok) {
        toast.error(
          result.error === "no_active_subscription"
            ? "No active subscription to cancel."
            : result.error === "billing_disabled"
              ? "Billing is currently disabled."
              : "Couldn't cancel your subscription. Try again in a moment.",
        );
        return;
      }
      setIsCancelModalOpen(false);
      setCancelAcknowledged(false);
      router.refresh();
      // Friendly confirmation — the "Canceling" pill + "Access ends …"
      // copy in the plan card carries the real state; the toast is the
      // audible receipt.
      const endsCopy = result.endsAt
        ? `You'll keep access until ${formatDate(result.endsAt)}.`
        : "You'll keep access until the end of your current period.";
      toast.success(`Subscription canceled. ${endsCopy}`);
    });
  };

  const handleResumeSubscription = () => {
    if (!sub) return;
    startResumeTransition(async () => {
      trackEvent("Subscription Resumed", {
        plan: sub.plan,
        cycle: sub.billingCycle,
      });
      const result = await resumeSubscriptionAction();
      if (!result.ok) {
        toast.error(
          result.error === "no_active_subscription"
            ? "No subscription to resume."
            : result.error === "billing_disabled"
              ? "Billing is currently disabled."
              : "Couldn't resume your subscription. Try again in a moment.",
        );
        return;
      }
      // Close the modal — the user came here to deal with the canceling
      // state and they just did. They can re-open if they want to also
      // change plan / cycle / seats.
      setIsUpgradeModalOpen(false);
      router.refresh();
      toast.success("Subscription resumed. You'll keep your plan.");
    });
  };

  const handleEditPaymentMethod = () => {
    if (!portalUpdateUrl) {
      toast.error(
        "Couldn't open the payment method page — try again in a moment.",
      );
      return;
    }
    window.open(portalUpdateUrl, "_blank", "noopener,noreferrer");
  };

  // Workspace usage label/bar. Free and Pro are member-limited per
  // workspace; Team is seat-limited per subscription.
  const memberLimit: number | null = (() => {
    if (currentPlan === "team" && sub) return sub.seats;
    return currentPlanData.memberLimit;
  })();
  const usagePercent =
    memberLimit && memberLimit > 0
      ? Math.min(100, Math.round((memberCount / memberLimit) * 100))
      : 0;

  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        {/* Header */}
        <PageHeader
          title="Billing"
          description={`Your plan, payment method and invoices for ${workspaceName}.`}
        />

        {/* Legacy context banner for users who still have old workspace-scoped
            Team rows. New Team subscriptions are account-scoped, so this should
            disappear once webhook reconciliation has refreshed their state. */}
        {billingState.workspacePlan !== "team" &&
          otherTeamWorkspaces.length > 0 && (
            <div className="p-4 rounded-xl bg-[#F9F5FF] border border-[#E9D7FE] flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[#F4EBFF] flex items-center justify-center flex-shrink-0">
                <Info
                  className="w-4 h-4 text-[#7F56D9]"
                  strokeWidth={2}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-[#53389E] leading-[20px]">
                  You already own Team on{" "}
                  <span className="font-semibold">
                    {formatWorkspaceNames(otherTeamWorkspaces)}
                  </span>
                </p>
                <p className="text-[13px] text-[#6941c6] mt-1 leading-[18px]">
                  Team is moving to account-wide billing. Open Billing to
                  refresh this workspace under your active Team subscription.
                </p>
              </div>
            </div>
          )}

        {/* Top grid — Plan card + Payment method card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Plan card */}
          <section className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-6 flex flex-col">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-[14px] font-medium text-[#525252]">Plan</h2>
              {currentPlan === "free" ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F2F4F7] text-[#475467]">
                  Free
                </span>
              ) : sub?.status === "past_due" ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  Payment past due
                </span>
              ) : sub?.cancelAtPeriodEnd ? (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                  Canceling
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6]">
                  Active
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[28px] font-semibold text-[#171717] leading-[36px] capitalize">
                {currentPlan}
              </span>
              {sub && (
                <span className="text-[13px] text-[#737373]">
                  {sub.billingCycle === "monthly"
                    ? "billed monthly"
                    : "billed yearly"}
                </span>
              )}
            </div>

            {sub?.founderPrice && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F4EBFF] text-[#6941C6] border border-[#E9D7FE]">
                  Founding member
                </span>
                <span className="text-[13px] text-[#404040]">
                  {sub.billingCycle === "monthly"
                    ? `$${FOUNDER_PRO_PRICES.monthly}/month`
                    : `$${FOUNDER_PRO_PRICES.yearly}/year`}
                  , locked in while you stay subscribed
                </span>
              </div>
            )}

            {sub ? (
              <p className="text-[13px] text-[#737373] mb-5">
                {sub.cancelAtPeriodEnd
                  ? `Access ends ${formatDate(sub.currentPeriodEnd)}`
                  : sub.currentPeriodEnd
                    ? `Renews ${formatDate(sub.currentPeriodEnd)}`
                    : ""}
              </p>
            ) : currentPlan === "free" ? (
              <div className="mb-5">
                <p className="text-[13px] text-[#737373]">
                  You&apos;re on the Free plan — upgrade for unlimited docs, Word
                  export, your own export footer and your own domain.
                </p>
                {founderOfferOpen && founderOffer && (
                  <p className="text-[13px] text-[#6941C6] font-medium mt-2">
                    Founding-member price: Pro for $
                    {FOUNDER_PRO_PRICES.monthly}/month, locked in while you stay
                    subscribed. Ends {formatOfferEnd(founderOffer.endsAt)}.
                  </p>
                )}
              </div>
            ) : (
              // A paid plan without a subscription: complimentary access.
              <p className="text-[13px] text-[#737373] mb-5">
                {hasCreatorAccess
                  ? "Complimentary Team plan with creator access. Nothing to pay."
                  : hasFounderAccess
                    ? "Complimentary Pro plan with founder access. Nothing to pay."
                    : `Your ${currentPlan === "team" ? "Team" : "Pro"} plan is included. Nothing to pay.`}
              </p>
            )}

            {/* Workspace usage */}
            <div className="mt-auto pt-4 border-t border-[#e5e5e5]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-medium text-[#525252]">
                  Workspace usage
                </span>
                <span className="text-[12px] font-medium text-[#737373]">
                  {memberLimit
                    ? `${memberCount} of ${memberLimit} ${
                        currentPlan === "team" ? "seats" : "members"
                      }`
                    : `${memberCount} ${memberCount === 1 ? "member" : "members"}`}
                </span>
              </div>
              {memberLimit !== null && (
                <div className="w-full h-1.5 rounded-full bg-[#F2F4F7] overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usagePercent >= 100
                        ? "bg-[#F04438]"
                        : usagePercent >= 80
                          ? "bg-[#F79009]"
                          : "bg-[#7F56D9]"
                    }`}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              )}

              {sub?.cancelAtPeriodEnd ? (
                // A cancelled plan's main action is to keep it.
                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    onClick={handleResumeSubscription}
                    disabled={!billingEnabled || isResuming}
                    className="w-full bg-[#7F56D9] hover:bg-[#6941C6] disabled:bg-[#d4d4d4] disabled:cursor-not-allowed text-white rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-colors inline-flex items-center justify-center gap-1.5"
                  >
                    {isResuming && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {isResuming ? "Resuming…" : "Resume subscription"}
                  </button>
                  <button
                    onClick={() => setIsUpgradeModalOpen(true)}
                    disabled={!billingEnabled}
                    className="w-full border border-[#d4d4d4] bg-white hover:bg-[#fafafa] disabled:opacity-50 text-[#404040] rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-colors"
                  >
                    Change plan
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsUpgradeModalOpen(true)}
                  disabled={!billingEnabled}
                  className="mt-4 w-full bg-[#7F56D9] hover:bg-[#6941C6] disabled:bg-[#d4d4d4] disabled:cursor-not-allowed text-white rounded-[8px] px-4 py-2 text-[13px] font-semibold transition-colors"
                >
                  {currentPlan === "free" ? "Upgrade plan" : "Change plan"}
                </button>
              )}
            </div>
          </section>

          {/* Payment method card */}
          <section className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-6 flex flex-col">
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-[14px] font-medium text-[#525252]">
                Payment method
              </h2>
              {paymentMethod && portalUpdateUrl && (
                <button
                  onClick={handleEditPaymentMethod}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#6941c6] hover:text-[#53389E] transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </button>
              )}
            </div>

            {paymentMethod ? (
              <>
                <div className="flex items-center gap-3 mt-3 mb-4">
                  <CardBrandGlyph
                    brand={paymentMethod.brand}
                    className="w-12 h-8 text-[#525252]"
                  />
                  <div className="flex flex-col">
                    <span className="text-[15px] font-medium text-[#171717] tabular-nums">
                      {paymentMethod.brandLabel}{" "}
                      <span className="text-[#737373]">••••</span>{" "}
                      {paymentMethod.last4}
                    </span>
                    <span className="text-[12px] text-[#737373]">
                      Expires{" "}
                      {formatExpiry(
                        paymentMethod.expiryMonth,
                        paymentMethod.expiryYear,
                      )}
                    </span>
                  </div>
                </div>
                <div className="mt-auto pt-4 border-t border-[#e5e5e5]">
                  <div className="text-[12px] font-medium text-[#525252] mb-1">
                    Billing email
                  </div>
                  <div className="text-[13px] text-[#404040] truncate">
                    {userEmail}
                  </div>
                </div>
              </>
            ) : sub ? (
              // Sub exists but Paddle didn't hand us a card — transient
              // fetch error, not a genuine "never added one" state.
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                <div className="w-12 h-12 rounded-full bg-[#F9FAFB] flex items-center justify-center mb-3">
                  <CreditCard
                    className="w-5 h-5 text-[#A3A3A3]"
                    strokeWidth={1.5}
                  />
                </div>
                <p className="text-[13px] font-medium text-[#404040] mb-1">
                  Couldn&apos;t load payment method
                </p>
                <p className="text-[12px] text-[#737373] max-w-[240px] mb-4">
                  There was a hiccup fetching your card from Paddle. Refresh
                  the page or try again in a moment.
                </p>
                <button
                  onClick={() => router.refresh()}
                  className="inline-flex items-center gap-1.5 bg-white hover:bg-[#fafafa] border border-[#d4d4d4] text-[#404040] rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
                <div className="w-12 h-12 rounded-full bg-[#F9FAFB] flex items-center justify-center mb-3">
                  <CreditCard
                    className="w-5 h-5 text-[#A3A3A3]"
                    strokeWidth={1.5}
                  />
                </div>
                <p className="text-[13px] font-medium text-[#404040] mb-1">
                  No payment method on file
                </p>
                <p className="text-[12px] text-[#737373] max-w-[220px] mb-4">
                  Choose a plan to add a card — Paddle handles checkout
                  securely.
                </p>
                <button
                  onClick={() => setIsUpgradeModalOpen(true)}
                  disabled={!billingEnabled}
                  className="inline-flex items-center gap-1.5 bg-white hover:bg-[#fafafa] border border-[#d4d4d4] disabled:cursor-not-allowed text-[#404040] rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  Add payment method
                </button>
              </div>
            )}
          </section>
        </div>

        {/* Billing and invoicing */}
        <section className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] overflow-hidden">
          <div className="px-6 py-5 border-b border-[#e5e5e5]">
            <h2 className="text-[16px] font-semibold text-[#171717] mb-0.5">
              Billing and invoicing
            </h2>
            <p className="text-[13px] text-[#737373]">
              Download invoices for every past charge. Invoices are issued by
              Paddle, our merchant of record.
            </p>
          </div>

          {invoices.length === 0 ? (
            <InvoicesEmptyState hasSubscription={sub !== null} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[12px] font-medium text-[#737373] bg-[#FAFAFA] border-b border-[#e5e5e5]">
                    <th className="px-4 sm:px-6 py-3 font-medium">Date</th>
                    <th className="hidden sm:table-cell px-6 py-3 font-medium">Invoice</th>
                    <th className="hidden sm:table-cell px-6 py-3 font-medium">Status</th>
                    <th className="hidden sm:table-cell px-6 py-3 font-medium">Plan</th>
                    <th className="px-4 sm:px-6 py-3 font-medium text-right">Amount</th>
                    <th className="px-4 sm:px-6 py-3 font-medium text-right">
                      Download
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const downloading = downloadingInvoiceId === inv.id;
                    return (
                      <tr
                        key={inv.id}
                        className="border-b border-[#f2f4f7] last:border-b-0 hover:bg-[#fafafa] transition-colors"
                      >
                        <td className="px-4 sm:px-6 py-3.5 text-[#404040]">
                          {formatDate(inv.billedAt)}
                        </td>
                        <td className="hidden sm:table-cell px-6 py-3.5 text-[#525252] tabular-nums">
                          {inv.invoiceNumber ?? "—"}
                        </td>
                        <td className="hidden sm:table-cell px-6 py-3.5">
                          <InvoiceStatusPill status={inv.status} />
                        </td>
                        <td className="hidden sm:table-cell px-6 py-3.5 text-[#404040] capitalize">
                          {inv.planLabel}
                        </td>
                        <td className="px-4 sm:px-6 py-3.5 text-[#171717] font-medium text-right tabular-nums">
                          {inv.amountFormatted}
                        </td>
                        <td className="px-4 sm:px-6 py-3.5 text-right">
                          <button
                            onClick={() => handleInvoiceDownload(inv.id)}
                            disabled={downloading}
                            className="inline-flex items-center gap-1.5 text-[#6941c6] hover:text-[#53389E] font-medium transition-colors disabled:opacity-60"
                          >
                            {downloading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                            {downloading ? "Opening…" : "PDF"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {/* Activation overlay — shown after Paddle redirects back with ?success=1.
          "pending" = polling the webhook result; "confirmed" = celebrating. */}
      {activationState !== "idle" && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[min(420px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col items-center text-center animate-in zoom-in-95 fade-in-0 duration-300">
            {activationState === "pending" ? (
              <>
                <div className="w-16 h-16 rounded-full bg-[#F9F5FF] flex items-center justify-center mb-5">
                  <Loader2 className="w-8 h-8 text-[#7F56D9] animate-spin" />
                </div>
                <h2 className="text-[18px] font-semibold text-[#171717] mb-2">
                  Activating your subscription
                </h2>
                <p className="text-[14px] text-[#525252] leading-[20px]">
                  Thanks for upgrading! We&apos;re syncing your new plan — this
                  usually takes just a few seconds.
                </p>
              </>
            ) : (
              <>
                <div
                  key="confirmed-icon"
                  className="w-16 h-16 rounded-full bg-[#ECFDF3] flex items-center justify-center mb-5 animate-in zoom-in-50 fade-in-0 duration-500"
                >
                  <Check className="w-8 h-8 text-[#027A48]" strokeWidth={3} />
                </div>
                <h2 className="text-[20px] font-semibold text-[#171717] mb-2">
                  You&apos;re on{" "}
                  <span className="capitalize text-[#6941c6]">
                    {confirmedPlan ??
                      (currentPlan !== "free" ? currentPlan : "Pro")}
                  </span>
                  !
                </h2>
                <p className="text-[14px] text-[#525252] leading-[20px] mb-6">
                  Your new plan is ready to use. Enjoy!
                </p>
                <button
                  onClick={() => {
                    setActivationState("idle");
                    setConfirmedPlan(null);
                  }}
                  className="w-full bg-[#7F56D9] hover:bg-[#6941C6] text-white rounded-[8px] px-4 py-2.5 text-[14px] font-semibold transition-colors"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Upgrade Modal */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => !isCheckoutLoading && setIsUpgradeModalOpen(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-[min(880px,calc(100vw-32px))] max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsUpgradeModalOpen(false)}
              disabled={isCheckoutLoading}
              className="absolute right-4 top-4 text-[#A3A3A3] hover:text-[#525252] transition-colors z-10 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="px-6 pt-6 pb-4 border-b border-[#e5e5e5]">
              <h2 className="text-[18px] font-semibold text-[#171717] mb-1">
                Choose a plan
              </h2>
              <p className="text-[14px] text-[#525252] mb-4">
                Pick the plan that fits. Change or cancel anytime.
              </p>

              <div className="flex items-center gap-2 bg-[#fafafa] rounded-lg p-1 w-fit">
                <button
                  onClick={() => setBillingCycle("monthly")}
                  className={`px-4 py-1.5 rounded-md text-[14px] font-medium transition-colors ${
                    billingCycle === "monthly"
                      ? "bg-white text-[#171717] shadow-sm"
                      : "text-[#525252]"
                  }`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setBillingCycle("yearly")}
                  className={`px-4 py-1.5 rounded-md text-[14px] font-medium transition-colors inline-flex items-center gap-2 ${
                    billingCycle === "yearly"
                      ? "bg-white text-[#171717] shadow-sm"
                      : "text-[#525252]"
                  }`}
                >
                  Yearly
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-[#027A48] text-white px-1.5 py-0.5 rounded">
                    Save 25%
                  </span>
                </button>
              </div>
            </div>

            {/* Pending-cancel banner — sits between the header and the
                scrollable plan grid so it stays visible regardless of
                scroll position. */}
            {sub?.cancelAtPeriodEnd && (
              <div className="px-6 py-3 bg-[#FEF3C7] border-b border-[#FDE68A] flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[#92400E] leading-[18px]">
                    Your <span className="capitalize">{sub.plan}</span> plan is
                    set to cancel on {formatDate(sub.currentPeriodEnd)}.
                  </p>
                  <p className="text-[12px] text-[#92400E]/80 mt-0.5 leading-[16px]">
                    You&apos;ll keep access until then. Resume to stay on{" "}
                    <span className="capitalize">{sub.plan}</span>, or pick a
                    different plan below to switch.
                  </p>
                </div>
                <button
                  onClick={handleResumeSubscription}
                  disabled={isResuming || isCheckoutLoading}
                  className="flex-shrink-0 inline-flex items-center gap-1.5 bg-white hover:bg-[#fafafa] border border-[#FDE68A] text-[#92400E] rounded-[8px] px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isResuming ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Resuming…
                    </>
                  ) : (
                    "Resume subscription"
                  )}
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {plans.map((plan) => {
                  const isSelected = selectedPlan === plan.type;
                  const isCurrent = currentPlan === plan.type;
                  const founderPrice =
                    plan.type === "pro" && proAtFounderPrice;
                  const price = founderPrice
                    ? FOUNDER_PRO_PRICES[billingCycle]
                    : billingCycle === "monthly"
                      ? plan.monthlyPrice
                      : plan.yearlyPrice;
                  const cycleLabel = billingCycle === "monthly" ? "mo" : "yr";
                  const teamTotal =
                    plan.perUser && plan.minSeats
                      ? price * Math.max(teamSeats, plan.minSeats)
                      : null;

                  return (
                    <button
                      key={plan.type}
                      type="button"
                      onClick={() => setSelectedPlan(plan.type)}
                      className={`relative text-left p-4 rounded-xl border-2 transition-colors flex flex-col ${
                        isSelected
                          ? "border-[#7F56D9] bg-[#F9F5FF]"
                          : "border-[#e5e5e5] bg-white hover:border-[#d4d4d4]"
                      }`}
                    >
                      {plan.recommended && (
                        <span className="absolute -top-2.5 right-3 text-[10px] font-bold uppercase tracking-wider bg-[#7F56D9] text-white px-2 py-0.5 rounded">
                          Popular
                        </span>
                      )}

                      <div className="flex items-start justify-between mb-1">
                        <span className="text-[15px] font-semibold text-[#171717]">
                          {plan.name}
                        </span>
                        <div
                          className={`w-[18px] h-[18px] rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-1 ${
                            isSelected
                              ? "border-[#7F56D9] bg-[#7F56D9]"
                              : "border-[#d4d4d4]"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-1.5 h-1.5 rounded-full bg-white" />
                          )}
                        </div>
                      </div>

                      <p className="text-[12px] text-[#737373] mb-3 leading-snug">
                        {plan.tagline}
                      </p>

                      <div className="mb-3">
                        <div className="flex items-baseline gap-1">
                          <span className="text-[28px] font-bold text-[#171717] leading-none">
                            ${price}
                          </span>
                          {founderPrice && (
                            <s className="text-[15px] font-semibold text-[#A3A3A3]">
                              <span className="sr-only">Regular price </span>$
                              {PRO_PRICES[billingCycle]}
                            </s>
                          )}
                          {plan.type !== "free" && (
                            <span className="text-[13px] text-[#737373]">
                              {plan.perUser
                                ? `/user/${cycleLabel}`
                                : `/${cycleLabel}`}
                            </span>
                          )}
                        </div>
                        <p className="text-[12px] text-[#7F56D9] font-medium mt-1 min-h-[18px] leading-[18px]">
                          {teamTotal !== null
                            ? `${Math.max(teamSeats, plan.minSeats!)} seats · $${teamTotal}/${cycleLabel}`
                            : founderPrice
                              ? sub
                                ? "Your founding-member price"
                                : founderOffer
                                  ? `Founding-member price, until ${formatOfferEnd(founderOffer.endsAt, "short")}`
                                  : "Founding-member price"
                            : plan.type === "pro" && billingCycle === "yearly"
                              ? "$72/year — save $24"
                              : "\u00A0"}
                        </p>
                        {isCurrent &&
                          (sub?.cancelAtPeriodEnd ? (
                            <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]">
                              Canceling
                            </span>
                          ) : (
                            <span className="inline-flex items-center mt-2 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#ECFDF3] text-[#027A48] border border-[#ABEFC6]">
                              Current plan
                            </span>
                          ))}
                      </div>

                      <ul className="flex flex-col gap-2 flex-1">
                        {plan.features.map((feature) => (
                          <li
                            key={feature}
                            className="flex items-start gap-2 text-[13px] text-[#404040] leading-snug"
                          >
                            <Check className="w-3.5 h-3.5 text-[#7F56D9] flex-shrink-0 mt-0.5" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>

              {selectedPlan === "team" && (
                <div className="mt-4 p-4 rounded-lg bg-[#FAF5FF] border border-[#E9D7FE]">
                  <label
                    htmlFor="team-seats"
                    className="block text-[13px] font-medium text-[#53389E] mb-2"
                  >
                    Team size (minimum {minTeamSeats})
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                      id="team-seats"
                      type="number"
                      min={minTeamSeats}
                      max={500}
                      value={teamSeats}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n)) {
                          setTeamSeats(
                            Math.max(
                              minTeamSeats,
                              Math.min(500, Math.floor(n)),
                            ),
                          );
                        }
                      }}
                      className="w-full sm:w-24 border border-[#d4d4d4] rounded-[8px] px-[14px] py-[8px] text-[14px] text-[#171717] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all"
                    />
                    <span className="text-[13px] text-[#525252]">
                      Seats cover unique members across all workspaces you own
                      {seatFloor > TEAM_MIN_SEATS ? ` (${seatFloor} people today)` : ""}.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-[#e5e5e5]">
              {sub && selectedPlan !== "free" && !isSameAsCurrent && (
                <p className="text-[12px] text-[#737373] text-center mb-3">
                  Your saved payment method will be charged a prorated amount —
                  no need to re-enter your card.
                </p>
              )}
              {(() => {
                // Picking Free while a cancel is already pending is a
                // no-op — disable the button so we don't double-cancel
                // (which Paddle rejects anyway) and explain why.
                const isAlreadyCanceling =
                  selectedPlan === "free" &&
                  sub?.cancelAtPeriodEnd === true;
                return (
                  <div className="flex flex-col-reverse sm:flex-row gap-3">
                    <button
                      onClick={() => setIsUpgradeModalOpen(false)}
                      disabled={isCheckoutLoading}
                      className="w-full sm:flex-1 px-4 py-2.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-semibold text-[#404040] hover:bg-[#fafafa] transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleContinue}
                      disabled={
                        isCheckoutLoading ||
                        isSameAsCurrent ||
                        !billingEnabled ||
                        isAlreadyCanceling
                      }
                      title={
                        isAlreadyCanceling
                          ? `Already canceling — your plan moves to Free on ${formatDate(sub?.currentPeriodEnd ?? null)}.`
                          : undefined
                      }
                      className="w-full sm:flex-1 bg-[#7F56D9] hover:bg-[#6941C6] disabled:bg-[#d4d4d4] disabled:cursor-not-allowed text-white rounded-[8px] px-4 py-2.5 text-[14px] font-semibold transition-colors inline-flex items-center justify-center gap-2"
                    >
                      {isCheckoutLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {sub ? "Updating…" : "Opening checkout…"}
                        </>
                      ) : isSameAsCurrent ? (
                        "Current plan"
                      ) : isAlreadyCanceling ? (
                        "Already canceling"
                      ) : selectedPlan === "free" ? (
                        "Downgrade to Free"
                      ) : sub ? (
                        `Switch to ${plans.find((p) => p.type === selectedPlan)?.name}`
                      ) : (
                        `Continue with ${plans.find((p) => p.type === selectedPlan)?.name}`
                      )}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation modal — "We're sad to see you go…" */}
      {isCancelModalOpen && sub && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              if (!isCanceling) {
                setIsCancelModalOpen(false);
                setCancelAcknowledged(false);
              }
            }}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-[min(480px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto flex flex-col animate-in zoom-in-95 fade-in-0 duration-300">
            <button
              onClick={() => {
                setIsCancelModalOpen(false);
                setCancelAcknowledged(false);
              }}
              disabled={isCanceling}
              className="absolute right-4 top-4 text-[#A3A3A3] hover:text-[#525252] transition-colors z-10 disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="px-6 pt-6 pb-4">
              <h2 className="text-[18px] font-semibold text-[#171717] mb-1.5">
                We&apos;re sad to see you go
              </h2>
              <p className="text-[14px] text-[#525252] leading-[20px]">
                Cancel your{" "}
                <span className="capitalize font-medium text-[#171717]">
                  {sub.plan}
                </span>{" "}
                plan and downgrade to Free. You&apos;ll keep access to every
                paid feature until{" "}
                <span className="font-medium text-[#171717]">
                  {formatDate(sub.currentPeriodEnd)}
                </span>
                , then your workspace returns to the Free plan.
              </p>
            </div>

            <div className="px-6 pb-4">
              <label className="flex items-start gap-3 p-3 rounded-[8px] border border-[#e5e5e5] hover:border-[#d4d4d4] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={cancelAcknowledged}
                  onChange={(e) => setCancelAcknowledged(e.target.checked)}
                  disabled={isCanceling}
                  className="mt-0.5 w-4 h-4 accent-[#7F56D9] cursor-pointer"
                />
                <span className="text-[13px] text-[#404040] leading-[18px]">
                  I understand my plan will be canceled at the end of the
                  current billing period and I&apos;ll lose access to paid
                  features after that date.
                </span>
              </label>
            </div>

            <div className="px-6 py-4 border-t border-[#e5e5e5] flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => {
                  setIsCancelModalOpen(false);
                  setCancelAcknowledged(false);
                }}
                disabled={isCanceling}
                className="w-full sm:flex-1 px-4 py-2.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-semibold text-[#404040] hover:bg-[#fafafa] transition-colors disabled:opacity-50"
              >
                Keep my plan
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={!cancelAcknowledged || isCanceling}
                className="w-full sm:flex-1 bg-[#D92D20] hover:bg-[#B42318] disabled:bg-[#FECDCA] disabled:cursor-not-allowed text-white rounded-[8px] px-4 py-2.5 text-[14px] font-semibold transition-colors inline-flex items-center justify-center gap-2"
              >
                {isCanceling ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Canceling…
                  </>
                ) : (
                  "Cancel subscription"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small presentational components kept in-file — they're only used here and
// splitting them out would hurt locality more than it'd help.
// ---------------------------------------------------------------------------

function InvoiceStatusPill({ status }: { status: InvoiceSummary["status"] }) {
  const config: Record<
    InvoiceSummary["status"],
    { label: string; className: string }
  > = {
    paid: {
      label: "Paid",
      className: "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]",
    },
    completed: {
      label: "Paid",
      className: "bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]",
    },
    billed: {
      label: "Billed",
      className: "bg-[#EFF8FF] text-[#175CD3] border-[#B2DDFF]",
    },
    past_due: {
      label: "Past due",
      className: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]",
    },
    canceled: {
      label: "Canceled",
      className: "bg-[#F2F4F7] text-[#475467] border-[#E4E7EC]",
    },
    draft: {
      label: "Draft",
      className: "bg-[#F2F4F7] text-[#475467] border-[#E4E7EC]",
    },
    ready: {
      label: "Pending",
      className: "bg-[#F2F4F7] text-[#475467] border-[#E4E7EC]",
    },
  };
  const c = config[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${c.className}`}
    >
      {c.label}
    </span>
  );
}

function InvoicesEmptyState({
  hasSubscription,
}: {
  hasSubscription: boolean;
}) {
  return (
    <div className="px-6 py-12 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-full bg-[#F9FAFB] flex items-center justify-center mb-4">
        <FileText className="w-5 h-5 text-[#A3A3A3]" strokeWidth={1.5} />
      </div>
      <p className="text-[14px] font-medium text-[#404040] mb-1">
        {hasSubscription
          ? "Invoices will appear here"
          : "No invoices yet"}
      </p>
      <p className="text-[13px] text-[#737373] max-w-[340px]">
        {hasSubscription
          ? "Your first invoice will show up once the next billing cycle completes."
          : "Upgrade to a paid plan and your invoices will appear here automatically."}
      </p>
    </div>
  );
}
