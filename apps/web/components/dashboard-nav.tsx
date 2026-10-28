"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useState, useTransition } from "react";
import {
  BookOpen,
  Home,
  FileText,
  Key,
  Users,
  Plug,
  CreditCard,
  Settings,
  Zap,
  LogOut,
  ChevronDown,
  Check,
  Building2,
  Plus,
  Sparkles,
  Menu,
  X,
  Cable,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { API_BASE_URL } from "@/lib/config/api";
import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";
import { instanceHost, isSelfHosted } from "@opendocs/shared/config/instance";
import { addProWorkspaceAction } from "@/lib/billing/actions";
import {
  FOUNDER_PRO_PRICES,
  formatOfferEnd,
  useFounderOfferOpen,
  type FounderOfferView,
} from "@/lib/billing/founder-offer-display";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountPlanDisplay } from "@/components/public-user-menu";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type UserRole = "owner" | "admin" | "member";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  /** URL of the workspace's uploaded logo, or `null` to fall back to the
   *  default building-icon pill. Surfaces in the sidebar picker so users
   *  can recognize each workspace at a glance in the dropdown. */
  logoUrl: string | null;
  role: UserRole;
};

type DashboardNavProps = {
  user: {
    username: string;
    fullName: string | null;
    email: string;
    avatarUrl: string | null;
    compedTier: string | null;
    role: UserRole;
  };
  workspaces: Workspace[];
  activeWorkspaceId?: string;
  /** Highest tier currently entitled (max across user.plan + any Team
   *  workspaces the user belongs to). Drives both the sidebar upgrade
   *  nudge AND the workspace-creation limit. */
  effectivePlan: "free" | "pro" | "team";
  ownedWorkspaceCount: number;
  workspaceLimit: number;
  /** The open founding-member offer; changes the Free nudge's price line. */
  founderOffer: FounderOfferView | null;
};

/** Copy + price for the sidebar upgrade nudge, keyed by the user's
 *  current tier. The TEAM tier has no entry — it's the top, so the
 *  nudge is hidden. */
const UPGRADE_NUDGE: Record<
  "free" | "pro",
  { heading: string; body: string }
> = {
  free: {
    heading: "Upgrade to PRO",
    body: "Unlimited documents, Word export, your own export footer and your own domain — from $6/mo.",
  },
  pro: {
    heading: "Upgrade to TEAM",
    body: "Unlimited workspaces & members, one bill for the whole team, and priority support — from $4/user/mo.",
  },
};

/** Copy for the "you've hit your workspace limit" modal, keyed by the
 *  destination tier. Free hits at its workspace cap and is nudged to
 *  Pro; Pro hits at its workspace cap and is nudged to Team. (Team
 *  never hits — it's uncapped.) Numbers are interpolated from the
 *  shared PLAN_LIMITS source of truth. */
const WORKSPACE_LIMIT_MODAL: Record<
  "pro" | "pro_workspace" | "team",
  { title: string; body: string; cta: string }
> = {
  pro: {
    title: "Upgrade to Pro",
    body: `You've reached the workspace limit on the Free plan. Upgrade to Pro to create up to ${PLAN_LIMITS.pro.workspaces} workspaces (up to ${PLAN_LIMITS.pro.membersPerWorkspace} members each), plus get unlimited documents, Word export, and custom branding.`,
    cta: "Upgrade to Pro",
  },
  pro_workspace: {
    title: "Add another workspace",
    body: "Your Pro plan includes 2 workspaces. Add one more workspace for $4/month, billed on your existing Pro subscription.",
    cta: "Add workspace",
  },
  team: {
    title: "Upgrade to Team",
    body: `You've reached the workspace limit on the Pro plan (${PLAN_LIMITS.pro.workspaces} workspaces). Upgrade to Team for unlimited workspaces and members, one bill for the whole team, and priority support.`,
    cta: "Upgrade to Team",
  },
};

type NavItem = {
  href: string;
  icon: typeof Home;
  label: string;
  exact?: boolean;
  minRole?: "admin" | "owner";
};

/** Your own things first, then everything that belongs to the active workspace. */
const navSections: Array<{ label?: string; items: NavItem[] }> = [
  {
    items: [
      { href: "/dashboard", icon: Home, label: "Home", exact: true },
      { href: "/dashboard/documents", icon: FileText, label: "Documents" },
      { href: "/dashboard/api-keys", icon: Key, label: "API keys" },
      { href: "/dashboard/connected-apps", icon: Cable, label: "Connected apps" },
    ],
  },
  {
    label: "Workspace",
    items: [
      { href: "/dashboard/team", icon: Users, label: "Team" },
      { href: "/dashboard/integrations", icon: Plug, label: "Integrations" },
      // A self-hosted instance has no billing: every account has every feature.
      ...(isSelfHosted() ? [] : [{ href: "/dashboard/billing", icon: CreditCard, label: "Billing", minRole: "admin" as const }]),
      { href: "/dashboard/workspace", icon: Settings, label: "Settings" },
    ],
  },
];

const roleLevel: Record<UserRole, number> = { member: 0, admin: 1, owner: 2 };

export function DashboardNav({
  user,
  workspaces,
  activeWorkspaceId,
  effectivePlan,
  ownedWorkspaceCount,
  workspaceLimit,
  founderOffer,
}: DashboardNavProps) {
  const founderOfferOpen = useFounderOfferOpen(founderOffer);
  // Team users have nothing to upgrade to — `nudge` is null and the
  // card is omitted from the render below.
  const nudge =
    effectivePlan === "team"
      ? null
      : effectivePlan !== "pro" && founderOfferOpen && founderOffer
        ? {
            heading: UPGRADE_NUDGE.free.heading,
            body: `Unlimited documents, Word export, your own export footer and your own domain. Founding-member price: $${FOUNDER_PRO_PRICES.monthly}/mo, locked in. Ends ${formatOfferEnd(founderOffer.endsAt, "short")}.`,
          }
        : UPGRADE_NUDGE[effectivePlan === "pro" ? "pro" : "free"];
  const pathname = usePathname();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // The mobile menu closes once a link in it has navigated.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);

  // Add workspace modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  // Which tier the user is being nudged toward in the upgrade modal —
  // "pro" when they're on Free and out of workspaces, "team" when they're
  // on Pro and out. Set by handleAddWorkspaceClick when we open the modal.
  const [upgradeTarget, setUpgradeTarget] = useState<"pro" | "pro_workspace" | "team">("pro");
  const [newWsName, setNewWsName] = useState("");
  const [newWsSlug, setNewWsSlug] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [isAddingWorkspaceCapacity, startAddingWorkspaceCapacity] = useTransition();

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  const displayName = user.fullName || user.username;
  const planDisplay = accountPlanDisplay({
    plan: effectivePlan,
    compedTier: user.compedTier,
  });
  const hasFounderAccess = user.compedTier === "friends";
  const hasCreatorAccess = user.compedTier === "creator";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const handleSignOut = () => {
    setSigningOut(true);
    startTransition(async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    });
  };

  const handleSwitchWorkspace = async (workspaceId: string) => {
    if (workspaceId === activeWorkspaceId || switchingTo) return;
    setSwitchingTo(workspaceId);
    try {
      const res = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      if (res.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setSwitchingTo(null);
    }
  };

  const handleAddWorkspaceClick = () => {
    const limit = workspaceLimit;
    if (ownedWorkspaceCount >= limit) {
      // Free → nudge to Pro. Pro → add one more workspace as a recurring
      // add-on. Founder access behaves like Pro but has no underlying
      // Pro subscription to attach the add-on to, so nudge to Team.
      // Creator access reaches this branch only if data is stale because
      // its limit should be infinite; still avoid showing an upgrade nudge.
      if (hasCreatorAccess) {
        setNewWsName("");
        setNewWsSlug("");
        setCreateError(null);
        setShowCreateModal(true);
        return;
      }
      setUpgradeTarget(
        effectivePlan === "free"
          ? "pro"
          : hasFounderAccess
            ? "team"
            : "pro_workspace",
      );
      setUpgradeError(null);
      setShowUpgradeModal(true);
    } else {
      setNewWsName("");
      setNewWsSlug("");
      setCreateError(null);
      setShowCreateModal(true);
    }
  };

  const handleUpgradeModalAction = () => {
    if (upgradeTarget !== "pro_workspace") {
      setShowUpgradeModal(false);
      router.push("/dashboard/billing");
      return;
    }

    setUpgradeError(null);
    startAddingWorkspaceCapacity(async () => {
      const result = await addProWorkspaceAction();
      if (!result.ok) {
        setUpgradeError(
          result.error === "no_active_pro_subscription"
            ? "No active Pro subscription was found. Open Billing to check your plan."
            : result.error === "billing_disabled"
              ? "Billing is currently disabled."
              : "Couldn't add the workspace add-on. Try again from Billing.",
        );
        return;
      }

      setShowUpgradeModal(false);
      setNewWsName("");
      setNewWsSlug("");
      setCreateError(null);
      setShowCreateModal(true);
      router.refresh();
    });
  };

  const deriveSlug = (name: string) => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 32);
  };

  const handleNameChange = (value: string) => {
    setNewWsName(value);
    // Auto-derive slug from name unless user has manually edited it
    if (!newWsSlug || newWsSlug === deriveSlug(newWsName)) {
      setNewWsSlug(deriveSlug(value));
    }
  };

  const handleCreateWorkspace = async () => {
    if (!newWsName.trim() || !newWsSlug.trim()) return;
    setCreating(true);
    setCreateError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/workspaces`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newWsName.trim(), slug: newWsSlug.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        const messages: Record<string, string> = {
          invalid_slug: data.message ?? "Invalid workspace ID.",
          reserved_slug: "That workspace ID is reserved.",
          slug_taken: "That workspace ID is already taken.",
          plan_limit: "You've reached your workspace limit. Upgrade to create more.",
        };
        setCreateError(messages[data.error as string] ?? "Failed to create workspace.");
        return;
      }

      // Switch to the new workspace
      const switchRes = await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: data.workspace.id }),
      });

      setShowCreateModal(false);

      if (switchRes.ok) {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setCreateError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  // ---- Workspace switcher trigger (shared between dropdown and static) ----
  const workspaceTriggerContent = (
    <>
      {activeWorkspace?.logoUrl ? (
        <div className="w-7 h-7 rounded-md overflow-hidden flex-shrink-0 bg-white border border-gray-200">
          <img
            src={activeWorkspace.logoUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="w-7 h-7 rounded-md bg-[#7F56D9] flex items-center justify-center flex-shrink-0">
          <Building2 className="w-3.5 h-3.5 text-white" />
        </div>
      )}
      <div className="flex flex-col overflow-hidden flex-1 min-w-0">
        <span className="text-sm font-semibold text-gray-900 truncate">
          {activeWorkspace?.name ?? "Workspace"}
        </span>
        <span className="text-xs text-gray-500 truncate">
          {activeWorkspace?.slug ?? ""}
        </span>
      </div>
    </>
  );

  const visibleSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(({ minRole }) => !minRole || roleLevel[user.role] >= roleLevel[minRole]),
    }))
    .filter((section) => section.items.length > 0);

  const navLinks = (
    <nav className="flex flex-col gap-4" aria-label="Dashboard">
      {visibleSections.map((section, i) => (
        <div key={section.label ?? i} className="flex flex-col gap-0.5">
          {section.label && (
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
              {section.label}
            </p>
          )}
          {section.items.map(({ href, icon: Icon, label, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#F4F3FF] text-[#42307D]"
                    : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icon className={`h-[18px] w-[18px] ${isActive ? "text-[#7F56D9]" : "text-gray-400"}`} />
                {label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  const workspaceSwitcher = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border transition-colors text-left border-gray-200 hover:border-gray-300 bg-gray-50/50 cursor-pointer data-[state=open]:border-[#7F56D9]/30 data-[state=open]:bg-[#F9F5FF]"
        >
          {workspaceTriggerContent}
          <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="dashboard-light w-[var(--radix-dropdown-menu-trigger-width)] max-h-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-medium text-gray-400 uppercase tracking-wider">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => {
          const isActive = ws.id === activeWorkspaceId;
          const isSwitching = switchingTo === ws.id;
          return (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => handleSwitchWorkspace(ws.id)}
              // Only disable when a *different* workspace is mid-switch.
              // The active row is left clickable-but-no-op (see the
              // `workspaceId === activeWorkspaceId` guard in
              // `handleSwitchWorkspace`) so it doesn't pick up Radix's
              // default `data-[disabled]:opacity-50` dim — a selected
              // item shouldn't *look* greyed out.
              disabled={!!switchingTo && !isActive}
              className={`flex items-center gap-2.5 px-3 py-2 ${
                isActive ? "bg-[#F9F5FF]" : ""
              } ${isSwitching ? "opacity-60" : ""}`}
            >
              {ws.logoUrl ? (
                <div className="w-6 h-6 rounded-md overflow-hidden flex-shrink-0 bg-white border border-gray-200">
                  <img
                    src={ws.logoUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div
                  className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${
                    isActive ? "bg-[#7F56D9]" : "bg-gray-200"
                  }`}
                >
                  <Building2
                    className={`w-3 h-3 ${isActive ? "text-white" : "text-gray-500"}`}
                  />
                </div>
              )}
              <div className="flex flex-col overflow-hidden flex-1 min-w-0">
                <span className={`text-sm truncate ${isActive ? "font-semibold text-gray-900" : "font-medium text-gray-700"}`}>
                  {ws.name}
                </span>
                <span className="text-xs text-gray-400 truncate capitalize">{ws.role}</span>
              </div>
              {isActive && <Check className="w-4 h-4 text-[#7F56D9] flex-shrink-0" />}
              {isSwitching && (
                <div className="w-4 h-4 border-2 border-gray-300 border-t-[#7F56D9] rounded-full animate-spin flex-shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleAddWorkspaceClick}
          className="flex items-center gap-2.5 px-3 py-2 text-[#525252]"
        >
          <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 border border-dashed border-[#d4d4d4]">
            <Plus className="w-3 h-3 text-[#737373]" />
          </div>
          <span className="text-sm font-medium">Add workspace</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const nudgeCard = nudge ? (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col gap-3 relative overflow-hidden">
      <div className="w-8 h-8 border border-gray-200 rounded flex items-center justify-center">
        <Zap className="w-4 h-4 text-gray-600" />
      </div>
      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-1">
          {nudge.heading}
        </h4>
        <p className="text-sm text-gray-500 leading-snug">
          {nudge.body}
        </p>
      </div>
      <Link
        href="/dashboard/billing"
        className="w-full bg-[#7F56D9] hover:bg-[#6941C6] text-white text-sm font-medium py-2 rounded-md transition-colors text-center block"
      >
        Upgrade now
      </Link>
    </div>
  ) : null;

  const userMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-2 text-left transition-colors hover:border-gray-200 hover:bg-white">
          <div className="relative">
            <Avatar className="h-10 w-10 ring-1 ring-gray-200">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500" />
          </div>
          <div className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">
              {displayName}
            </span>
            <span className="block truncate text-xs text-gray-500">
              {user.email}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400 transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="top"
        sideOffset={8}
        className="dashboard-light w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden rounded-2xl border-gray-200 bg-white p-0 shadow-2xl shadow-gray-900/10"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <Avatar className="h-11 w-11 ring-1 ring-gray-200">
              <AvatarImage src={user.avatarUrl ?? undefined} alt={displayName} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-gray-900">
                {displayName}
              </span>
              <p className="mt-0.5 truncate text-xs text-gray-500">
                @{user.username}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span
                  className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ring-1 ${planDisplay.className}`}
                >
                  {planDisplay.label}
                </span>
                <span className="truncate text-[11px] font-medium text-gray-400">
                  {planDisplay.detail}
                </span>
              </div>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0 bg-gray-100" />
        <div className="p-1.5">
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm">
            <Link href="/dashboard/profile" className="flex items-center gap-3">
              <Settings className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <span>Profile settings</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm">
            <Link href="https://docs.opendocs.cc" className="flex items-center gap-3">
              <BookOpen className="h-4 w-4 text-gray-500" aria-hidden="true" />
              <span>Docs</span>
            </Link>
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="m-0 bg-gray-100" />
        <div className="p-1.5">
          <DropdownMenuItem
            onClick={handleSignOut}
            disabled={signingOut}
            className="min-h-12 rounded-xl text-sm text-gray-700"
          >
            <LogOut className="h-4 w-4 text-gray-500" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-medium">
                {signingOut ? "Signing out..." : "Sign out"}
              </p>
              <p className="truncate text-[11px] text-gray-400">
                {user.email}
              </p>
            </div>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <>
      {/* Mobile top bar: the full sidebar opens as a drawer */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-gray-200 bg-white px-2 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Open menu"
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-gray-700 hover:bg-gray-50"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent className="dashboard-light">
              <SheetTitle>Menu</SheetTitle>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <Link href="/" className="flex items-center">
                  <Image src="/opendocs-logo.svg" alt="OpenDocs" width={120} height={22} />
                </Link>
                <SheetClose
                  aria-label="Close menu"
                  className="flex h-10 w-10 items-center justify-center rounded-md text-gray-500 hover:bg-gray-50"
                >
                  <X className="h-5 w-5" />
                </SheetClose>
              </div>
              <div className="flex min-h-0 flex-1 flex-col justify-between gap-4 overflow-y-auto px-3 pb-3">
                <div className="flex flex-col gap-3">
                  {workspaceSwitcher}
                  {navLinks}
                </div>
                <div className="flex flex-col gap-3">
                  {nudgeCard}
                  {userMenu}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <Link href="/" className="flex min-h-[44px] items-center">
            <Image src="/opendocs-logo.svg" alt="OpenDocs" width={112} height={21} priority />
          </Link>
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <button
            onClick={() => setMobileOpen(true)}
            className="flex min-w-0 max-w-[160px] items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-gray-50"
            aria-label="Switch workspace"
          >
            <span className="truncate text-sm font-medium text-gray-700">{activeWorkspace?.name ?? "Workspace"}</span>
            <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-400" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Open account menu"
                className="p-2 rounded-md hover:bg-gray-50 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Avatar className="w-8 h-8">
                  <AvatarImage src={user.avatarUrl ?? undefined} alt={displayName} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              sideOffset={8}
              className="dashboard-light w-56 max-w-[calc(100vw-16px)]"
            >
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {displayName}
                  </span>
                  <span className="text-xs text-gray-500 truncate font-normal">
                    {user.email}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/dashboard/profile">Profile settings</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/dashboard/workspace">Workspace settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleSignOut}
                disabled={signingOut}
                className="text-gray-700"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {signingOut ? "Signing out..." : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 h-screen bg-white flex-col justify-between gap-4 p-4 flex-shrink-0 overflow-y-auto">
        <div>
          <div className="flex items-center gap-2 px-2 py-4 mb-2">
            <Link href="/">
              <Image src="/opendocs-logo.svg" alt="OpenDocs" width={138} height={26} priority />
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            {workspaceSwitcher}
            {navLinks}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {nudgeCard}
          {userMenu}
        </div>
      </aside>

      {/* ---- Create Workspace Modal ---- */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="dashboard-light max-w-[min(420px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none [&>button:last-child]:hidden outline-none">
          <div className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Header */}
            <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px]">
              <div className="rounded-[8px] size-[40px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                <Building2 className="w-[20px] h-[20px] text-[#404040]" strokeWidth={1.67} />
              </div>
              <div className="flex flex-col gap-[2px] items-start w-full">
                <DialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full">
                  Create a new workspace
                </DialogTitle>
                <p className="font-normal leading-[20px] text-[#525252] text-[14px] w-full">
                  Workspaces let you organize documents and collaborate with different teams.
                </p>
              </div>
            </div>

            {/* Form */}
            <div className="px-[24px] pt-[20px] flex flex-col gap-[16px]">
              <div className="flex flex-col gap-[6px]">
                <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                  Workspace name
                </label>
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="My Company"
                  autoComplete="off"
                  className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[16px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                />
              </div>
              <div className="flex flex-col gap-[6px]">
                <label className="font-medium leading-[20px] text-[#404040] text-[14px]">
                  Workspace ID
                </label>
                <input
                  type="text"
                  value={newWsSlug}
                  onChange={(e) => setNewWsSlug(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32))}
                  placeholder="my-company"
                  autoComplete="off"
                  className="w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[16px] font-mono text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
                />
                <p className="text-[13px] text-[#a3a3a3]">
                  {instanceHost()}/<span className="text-[#525252]">{newWsSlug || "my-company"}</span>/your-doc
                </p>
              </div>
              {createError && (
                <p className="text-[13px] text-[#DC2626]">{createError}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-[12px] items-start pt-[24px] pb-[24px] px-[24px]">
              <button
                onClick={() => setShowCreateModal(false)}
                disabled={creating}
                className="flex-1 relative rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#fafafa] transition-colors"
              >
                <div className="flex items-center justify-center px-[14px] py-[10px]">
                  <span className="font-semibold leading-[20px] text-[#404040] text-[14px]">
                    Cancel
                  </span>
                </div>
              </button>
              <button
                onClick={handleCreateWorkspace}
                disabled={creating || !newWsName.trim() || !newWsSlug.trim()}
                className="flex-1 relative rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-50 transition-colors shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center justify-center px-[14px] py-[10px]">
                  <span className="font-semibold leading-[20px] text-white text-[14px]">
                    {creating ? "Creating..." : "Create workspace"}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Upgrade Modal ----
          Copy is keyed by upgradeTarget — "pro" for Free users at limit,
          "team" for Pro users at limit. */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="dashboard-light max-w-[min(420px,calc(100vw-32px))] max-h-[90vh] overflow-y-auto p-0 border-none bg-transparent shadow-none [&>button:last-child]:hidden outline-none">
          <div className="bg-white flex flex-col overflow-clip rounded-[16px] shadow-[0px_20px_24px_-4px_rgba(0,0,0,0.08),0px_8px_8px_-4px_rgba(0,0,0,0.03),0px_3px_3px_-1.5px_rgba(0,0,0,0.04)] w-full">
            {/* Header */}
            <div className="flex flex-col gap-[16px] items-start pt-[24px] px-[24px]">
              <div className="rounded-[8px] size-[40px] bg-[#F9F5FF] border border-[#E9D7FE] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
                <Sparkles className="w-[20px] h-[20px] text-[#7F56D9]" strokeWidth={1.67} />
              </div>
              <div className="flex flex-col gap-[2px] items-start w-full">
                <DialogTitle className="font-semibold leading-[24px] text-[#171717] text-[16px] w-full">
                  {WORKSPACE_LIMIT_MODAL[upgradeTarget].title}
                </DialogTitle>
                <p className="font-normal leading-[20px] text-[#525252] text-[14px] w-full">
                  {WORKSPACE_LIMIT_MODAL[upgradeTarget].body}
                </p>
                {upgradeError && (
                  <p className="text-[13px] text-[#DC2626] mt-2">
                    {upgradeError}
                  </p>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-[12px] items-start pt-[24px] pb-[24px] px-[24px]">
              <button
                onClick={() => setShowUpgradeModal(false)}
                disabled={isAddingWorkspaceCapacity}
                className="flex-1 relative rounded-[8px] border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] hover:bg-[#fafafa] transition-colors"
              >
                <div className="flex items-center justify-center px-[14px] py-[10px]">
                  <span className="font-semibold leading-[20px] text-[#404040] text-[14px]">
                    Maybe later
                  </span>
                </div>
              </button>
              <button
                onClick={handleUpgradeModalAction}
                disabled={isAddingWorkspaceCapacity}
                className="flex-1 relative rounded-[8px] bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-60 transition-colors shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center justify-center px-[14px] py-[10px]">
                  <span className="font-semibold leading-[20px] text-white text-[14px]">
                    {isAddingWorkspaceCapacity
                      ? "Adding..."
                      : WORKSPACE_LIMIT_MODAL[upgradeTarget].cta}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
