"use client";

import { BadgeCheck, Plug } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { isSelfHosted } from "@opendocs/shared/config/instance";

import { PageHeader } from "@/components/dashboard/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MCP_DOCS_URL } from "@/lib/mcp";

import { disconnectAppAction } from "./actions";

type ConnectedApp = {
  id: string;
  name: string;
  host: string | null;
  verified: boolean;
  workspaceName: string | null;
  permissions: string[];
  connectedAt: string;
  lastUsedAt: string | null;
};

export function ConnectedAppsClient({ initialApps }: { initialApps: ConnectedApp[] }) {
  const [apps, setApps] = useState(initialApps);
  const [confirming, setConfirming] = useState<ConnectedApp | null>(null);
  const [pending, setPending] = useState(false);

  async function disconnect(app: ConnectedApp) {
    setPending(true);
    try {
      const result = await disconnectAppAction(app.id);
      if ("error" in result) throw new Error(result.error);
      setApps((current) => current.filter((a) => a.id !== app.id));
      toast.success(`${app.name} disconnected`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect the app");
    } finally {
      setPending(false);
      setConfirming(null);
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
      <PageHeader
        title="Connected apps"
        description={
          <>
            AI apps such as Claude and ChatGPT that you&apos;ve connected to OpenDocs over MCP. They act as
            you, with the permissions you approved.{" "}
            <Link href={isSelfHosted() ? MCP_DOCS_URL : "/mcp"} className="font-medium text-[#6941c6] hover:text-[#53389E]">
              Connect an app&nbsp;→
            </Link>
          </>
        }
      />

      <div className="w-full h-px bg-[#e5e5e5]" />

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-[32px]">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[14px] font-semibold text-[#404040] leading-[20px]">Your connections</h2>
          <p className="text-[14px] text-[#525252] font-normal leading-[20px] max-w-[240px]">
            Disconnecting signs the app out within seconds. You can connect it again whenever you like.
          </p>
        </div>

        <div className="bg-white border border-[#E5E5E5] rounded-[12px] overflow-hidden shadow-sm">
          {apps.length === 0 ? (
            <div className="py-12 px-6 text-center">
              <Plug className="mx-auto mb-3 h-6 w-6 text-[#A3A3A3]" strokeWidth={1.5} aria-hidden="true" />
              <p className="text-[14px] text-[#525252]">
                No apps connected yet.{" "}
                <Link href={isSelfHosted() ? MCP_DOCS_URL : "/mcp"} className="font-medium text-[#6941c6] hover:text-[#53389E]">
                  Connect Claude, ChatGPT or another AI app
                </Link>
                .
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E5E5E5]">
              {apps.map((app) => (
                <li key={app.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-[14px] font-medium text-[#171717]">
                      {app.name}
                      {app.verified ? (
                        <BadgeCheck className="h-4 w-4 text-[#6941c6]" aria-label="Verified app" />
                      ) : null}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-[20px] text-[#525252]">
                      {app.host ? `${app.host} · ` : ""}
                      {app.workspaceName ? `Default workspace: ${app.workspaceName} · ` : ""}
                      Connected {app.connectedAt} · Last used {app.lastUsedAt ?? "never"}
                    </p>
                    {app.permissions.length > 0 ? (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {app.permissions.map((permission) => (
                          <li
                            key={permission}
                            className="rounded-full bg-[#F4F0FD] px-2 py-0.5 text-[12px] leading-[18px] text-[#53389E]"
                          >
                            {permission}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirming(app)}
                    className="shrink-0 rounded-[8px] border border-[#d4d4d4] bg-white px-3 py-1.5 text-[14px] font-semibold text-[#404040] hover:bg-[#FAFAFA]"
                  >
                    Disconnect
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {confirming?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirming?.name} won&apos;t be able to read or change your documents any more. Documents it
              already published stay where they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                if (confirming) void disconnect(confirming);
              }}
              className="bg-[#DC2626] hover:bg-[#B91C1C]"
            >
              {pending ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
