"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import {
  BookOpen,
  Building2,
  Check,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Settings,
  User,
} from "lucide-react";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThemeMenuItems } from "@/components/theme-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type PublicUserMenuData = {
  displayName: string;
  username: string | null;
  email: string;
  avatarUrl: string | null;
  plan: "free" | "pro" | "team";
  compedTier: string | null;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    role: "owner" | "admin" | "member";
  }>;
};

type PublicUserMenuProps = {
  user: PublicUserMenuData;
  currentWorkspaceSlug?: string | null;
};

function initialsFor(label: string) {
  const words = label.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "OD";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return words
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
}

function roleLabel(role: PublicUserMenuData["workspaces"][number]["role"]) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function accountPlanDisplay(user: {
  plan: "free" | "pro" | "team";
  compedTier?: string | null;
}) {
  if (user.compedTier === "creator") {
    return {
      label: "Creator",
      detail: "Creator access",
      className:
        "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-100 dark:border-fuchsia-400/30 dark:bg-fuchsia-400/10 dark:text-fuchsia-300 dark:ring-fuchsia-400/20",
    };
  }

  if (user.compedTier === "friends") {
    return {
      label: "Founder",
      detail: "Founder access",
      className:
        "border-amber-200 bg-amber-50 text-amber-700 ring-amber-100 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
    };
  }

  if (user.plan === "team") {
    return {
      label: "Team",
      detail: "Team plan",
      className:
        "border-violet-200 bg-violet-50 text-violet-700 ring-violet-100 dark:border-violet-400/30 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
    };
  }

  if (user.plan === "pro") {
    return {
      label: "Pro",
      detail: "Pro plan",
      className:
        "border-emerald-200 bg-emerald-50 text-emerald-700 ring-emerald-100 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
    };
  }

  return {
    label: "Free",
    detail: "Free plan",
    className:
      "border-zinc-200 bg-zinc-50 text-zinc-600 ring-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  };
}

export function PublicUserMenu({
  user,
  currentWorkspaceSlug,
}: PublicUserMenuProps) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const displayName = user.displayName || user.username || user.email;
  const initials = initialsFor(displayName);
  const planDisplay = accountPlanDisplay(user);
  const currentWorkspace =
    user.workspaces.find(
      (workspace) => workspace.slug === currentWorkspaceSlug,
    ) ?? null;

  const switchWorkspace = async (
    workspace: PublicUserMenuData["workspaces"][number],
    destination: string,
  ) => {
    if (switchingTo) return;
    setSwitchingTo(workspace.id);
    try {
      await fetch("/api/workspace/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });
      router.push(destination);
      router.refresh();
    } finally {
      setSwitchingTo(null);
    }
  };

  const openWorkspaceSettings = () => {
    if (!currentWorkspace) {
      router.push("/dashboard/workspace");
      return;
    }

    void switchWorkspace(currentWorkspace, "/dashboard/workspace");
  };

  const handleSignOut = () => {
    setSigningOut(true);
    startTransition(async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
    });
  };

  return (
    // Non-modal: a modal menu locks page scroll, which shifted the page
    // sideways and misplaced the menu on scrolled pages.
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="pointer-events-auto inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition hover:ring-zinc-900/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 dark:bg-zinc-900/85 dark:shadow-black/20 dark:ring-white/10 dark:hover:ring-white/20"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage
              src={user.avatarUrl ?? undefined}
              alt={displayName}
              className="object-cover"
            />
            <AvatarFallback className="bg-gradient-to-br from-primary to-[#6B3FC9] text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="w-[min(21.5rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-2xl shadow-zinc-900/12 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/35"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-3 px-3.5 py-3">
            <Avatar className="h-12 w-12 ring-1 ring-zinc-200 dark:ring-zinc-800">
              <AvatarImage
                src={user.avatarUrl ?? undefined}
                alt={displayName}
                className="object-cover"
              />
              <AvatarFallback className="bg-gradient-to-br from-primary to-[#6B3FC9] text-sm font-semibold text-white">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                {displayName}
              </p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                {user.username ? (
                  <>
                    <span className="truncate">@{user.username}</span>
                    <span className="shrink-0 text-zinc-300 dark:text-zinc-700" aria-hidden="true">
                      ·
                    </span>
                  </>
                ) : null}
                <span className="truncate text-zinc-400 dark:text-zinc-500">{user.email}</span>
              </p>
              <div className="mt-2 flex items-center">
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.05em] ring-1 ${planDisplay.className}`}
                >
                  {planDisplay.label}
                </span>
              </div>
            </div>
          </div>
        </DropdownMenuLabel>

        <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />

        <ThemeMenuItems />

        <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />

        <div className="p-1.5">
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900">
            <Link href="/dashboard/profile" className="flex items-center gap-3">
              <User className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              <span>View profile</span>
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900">
            <Link
              href={
                currentWorkspace
                  ? `/dashboard/open?workspace=${encodeURIComponent(currentWorkspace.id)}`
                  : "/dashboard"
              }
              className="flex items-center gap-3"
            >
              <LayoutDashboard
                className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
                aria-hidden="true"
              />
              <span>Dashboard</span>
            </Link>
          </DropdownMenuItem>
          {currentWorkspace ? (
            <DropdownMenuItem
              className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900"
              disabled={switchingTo === currentWorkspace.id}
              onSelect={(event) => {
                event.preventDefault();
                openWorkspaceSettings();
              }}
            >
              <Settings className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              <span>
                {switchingTo === currentWorkspace.id
                  ? "Opening settings..."
                  : "Workspace settings"}
              </span>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900">
            <Link href="/dashboard/billing" className="flex items-center gap-3">
              <CreditCard
                className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
                aria-hidden="true"
              />
              <span>Billing</span>
            </Link>
          </DropdownMenuItem>
        </div>

        {user.workspaces.length > 0 ? (
          <>
            <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />
            <div className="px-1.5 py-2">
              <div className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                Workspaces
              </div>
              <div className="max-h-[14.5rem] overflow-y-auto pr-1">
                {user.workspaces.map((workspace) => {
                  const isCurrent = workspace.slug === currentWorkspaceSlug;
                  const workspaceInitials = initialsFor(workspace.name);
                  return (
                    <DropdownMenuItem
                      key={workspace.id}
                      disabled={switchingTo === workspace.id}
                      className="min-h-12 rounded-xl p-1.5 dark:focus:bg-zinc-900"
                      onSelect={(event) => {
                        event.preventDefault();
                        void switchWorkspace(workspace, `/${workspace.slug}`);
                      }}
                    >
                      <div className="mr-2.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-100 ring-1 ring-zinc-200/70 dark:bg-zinc-900 dark:ring-zinc-800">
                        {workspace.logoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={workspace.logoUrl}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                            {workspaceInitials}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-zinc-800 dark:text-zinc-100">
                            {workspace.name}
                          </span>
                        </div>
                        <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          <span className="truncate">{workspace.slug}</span>
                          <span aria-hidden="true">·</span>
                          <span>{roleLabel(workspace.role)}</span>
                        </div>
                      </div>
                      <span className="ml-2 flex h-5 w-5 shrink-0 items-center justify-center">
                        {isCurrent ? (
                          <Check
                            className="h-4 w-4 text-primary dark:text-violet-300"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </div>
            </div>
          </>
        ) : null}

        <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />

        <div className="p-1.5">
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900">
            <Link
              href="https://docs.opendocs.cc"
              className="flex items-center gap-3"
            >
              <BookOpen className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              <span>Documentation</span>
            </Link>
          </DropdownMenuItem>
          {/* <DropdownMenuItem asChild className="h-10 rounded-xl text-sm">
            <Link href="/dashboard/workspace" className="flex items-center gap-3">
              <Building2 className="h-4 w-4 text-zinc-500" aria-hidden="true" />
              <span>Manage workspaces</span>
            </Link>
          </DropdownMenuItem> */}
        </div>

        <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />

        <div className="p-1.5">
          <DropdownMenuItem
            className="min-h-12 rounded-xl text-sm dark:focus:bg-zinc-900"
            disabled={signingOut}
            onSelect={(event) => {
              event.preventDefault();
              handleSignOut();
            }}
          >
            <LogOut className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                {signingOut ? "Signing out..." : "Sign out"}
              </p>
              <p className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">{user.email}</p>
            </div>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
