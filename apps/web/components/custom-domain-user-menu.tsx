"use client";

import { LayoutDashboard, LogOut } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PublicUserMenuData } from "@/components/public-user-menu";
import { ThemeMenuItems } from "@/components/theme-menu";
import type { CustomSiteContext } from "@/lib/site-paths";

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

/**
 * Account menu on a custom domain. A sign-in there only reads and
 * comments, so the menu is short: who you are, the theme, the dashboard on
 * opendocs.cc (opened on this workspace), and signing out, which also signs
 * out of opendocs.cc: otherwise the next private page would sign a member
 * straight back in.
 */
export function CustomDomainUserMenu({
  user,
  site,
}: {
  user: PublicUserMenuData;
  site: CustomSiteContext;
}) {
  const displayName = user.displayName || user.username || user.email;
  const initials = initialsFor(displayName);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Open account menu"
          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm shadow-zinc-900/5 ring-1 ring-zinc-900/10 transition hover:ring-zinc-900/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 dark:bg-zinc-900/85 dark:ring-white/10 dark:hover:ring-white/20"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatarUrl ?? undefined} alt={displayName} className="object-cover" />
            <AvatarFallback className="bg-gradient-to-br from-primary to-[#6B3FC9] text-xs font-semibold text-white">
              {initials}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-2xl shadow-zinc-900/12 dark:border-zinc-800 dark:bg-zinc-950"
      >
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="px-3.5 py-3">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">{displayName}</p>
            <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">{user.email}</p>
            <p className="mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
              Signed in to {site.hostname}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />
        <ThemeMenuItems />
        <DropdownMenuSeparator className="m-0 bg-zinc-100 dark:bg-zinc-800" />
        <div className="p-1.5">
          <DropdownMenuItem asChild className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900">
            <a
              href={`${site.opendocsOrigin}/dashboard/open?workspace=${encodeURIComponent(site.workspaceId)}`}
              className="flex items-center gap-3"
            >
              <LayoutDashboard className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
              <span>OpenDocs dashboard</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="h-10 rounded-xl text-sm dark:focus:bg-zinc-900"
            onSelect={(event) => {
              event.preventDefault();
              const form = document.getElementById("od-custom-sign-out") as HTMLFormElement | null;
              form?.requestSubmit();
            }}
          >
            <LogOut className="h-4 w-4 text-zinc-500 dark:text-zinc-400" aria-hidden="true" />
            <span>Sign out</span>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
      {/* A real form so signing out works as a plain POST (no fetch). */}
      <form id="od-custom-sign-out" method="post" action="/_opendocs/sign-out" className="hidden" />
    </DropdownMenu>
  );
}
