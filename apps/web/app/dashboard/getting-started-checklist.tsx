"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { startTransition, useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  Loader2,
  Palette,
  Users,
} from "lucide-react";
import { toast } from "sonner";

import { CopyAgentPrompt } from "@/components/copy-agent-prompt";

type GettingStartedChecklistProps = {
  publishedFirstDocument: boolean;
  exportsCustomized: boolean;
  /** Members can't change export branding, so they don't get that step. */
  showExportsStep: boolean;
  teamStepCompleted: boolean;
  inviteStepDismissed: boolean;
  agentPrompt: string;
};

// `!` because globals.css gives every <button> `font: inherit` outside the
// Tailwind layers, which would otherwise win over text-[14px].
const primaryButton =
  "inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[8px] bg-[#7F56D9] px-3.5 py-2 !text-[14px] !font-semibold text-white transition-colors hover:bg-[#6941C6] sm:w-auto";

export function GettingStartedChecklist({
  publishedFirstDocument,
  exportsCustomized,
  showExportsStep,
  teamStepCompleted,
  inviteStepDismissed,
  agentPrompt,
}: GettingStartedChecklistProps) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(inviteStepDismissed);
  const [dismissing, setDismissing] = useState(false);

  const inviteStepHandled = teamStepCompleted || dismissed;
  const showInviteStep = !inviteStepHandled;
  const showInviteCard = teamStepCompleted || !dismissed;
  const showSection = !publishedFirstDocument || !exportsCustomized || showInviteStep;
  const totalSteps = showExportsStep ? 3 : 2;

  const completedCount = useMemo(() => {
    let count = 0;
    if (publishedFirstDocument) count += 1;
    if (showExportsStep && exportsCustomized) count += 1;
    if (teamStepCompleted || dismissed) count += 1;
    return count;
  }, [dismissed, exportsCustomized, publishedFirstDocument, showExportsStep, teamStepCompleted]);

  if (!showSection) return null;

  const handleDismissInvite = () => {
    setDismissing(true);
    startTransition(async () => {
      try {
        const res = await fetch("/api/dashboard/getting-started/dismiss-invite", {
          method: "POST",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to dismiss");
        setDismissed(true);
        router.refresh();
      } catch {
        toast.error("Could not hide this step");
      } finally {
        setDismissing(false);
      }
    });
  };

  return (
    <section className="rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-[16px] font-semibold leading-[24px] text-[#171717]">
            Get started with OpenDocs
          </h2>
          <p className="mt-1 text-[14px] leading-[20px] text-[#525252]">
            Publish Markdown from your AI agent, make the exports look like
            yours, then bring teammates in when you are ready.
          </p>
        </div>
        <div className="mt-2 inline-flex w-fit items-center rounded-full bg-[#f4ebff] px-2.5 py-1 text-[12px] font-semibold text-[#6941c6] sm:mt-0">
          {completedCount} of {totalSteps} complete
        </div>
      </div>

      <div
        className={`mt-5 grid grid-cols-1 gap-4 ${
          showExportsStep && showInviteCard ? "md:grid-cols-3" : "md:grid-cols-2"
        }`}
      >
        <StepCard
          icon={<FileText className="h-5 w-5" />}
          title="Publish your first document"
          description="Paste the prompt into your AI agent. It sets up OpenDocs and publishes Markdown into this workspace."
          completed={publishedFirstDocument}
          completedLabel="First document published"
          action={
            <CopyAgentPrompt
              prompt={agentPrompt}
              source="getting_started"
              label="Copy prompt"
              className={primaryButton}
            />
          }
        />

        {showExportsStep && (
          <StepCard
            icon={<Palette className="h-5 w-5" />}
            title="Customize your exports"
            description="Add your logo, brand color and font so every PDF your agent exports looks like it came from you."
            completed={exportsCustomized}
            completedLabel="Exports branded"
            action={
              <Link href="/dashboard/workspace#export-branding" className={primaryButton}>
                Customize exports
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          />
        )}

        {showInviteCard && (
          <StepCard
            icon={<Users className="h-5 w-5" />}
            title="Invite your team"
            label="Optional"
            description="Bring teammates in when you want them to read, publish, or manage docs with you."
            completed={teamStepCompleted}
            completedLabel="Team step complete"
            action={
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <Link href="/dashboard/team" className={primaryButton}>
                  Invite teammates
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <button
                  type="button"
                  onClick={handleDismissInvite}
                  disabled={dismissing}
                  className="inline-flex w-full items-center justify-center gap-2 whitespace-nowrap rounded-[8px] border border-[#d4d4d4] bg-white px-3.5 py-2 !text-[14px] !font-semibold text-[#404040] transition-colors hover:bg-[#fafafa] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                >
                  {dismissing && <Loader2 className="h-4 w-4 animate-spin" />}
                  Skip for now
                </button>
              </div>
            }
          />
        )}
      </div>
    </section>
  );
}

function StepCard({
  icon,
  title,
  label,
  description,
  completed,
  completedLabel,
  action,
}: {
  icon: ReactNode;
  title: string;
  label?: string;
  description: string;
  completed: boolean;
  completedLabel: string;
  action: ReactNode;
}) {
  return (
    <div
      className={`flex min-h-[176px] flex-col justify-between rounded-xl border p-4 transition-colors ${
        completed
          ? "border-[#bbf7d0] bg-[#f0fdf4]"
          : "border-[#e5e5e5] bg-[#fafafa]"
      }`}
    >
      <div className="flex gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
            completed
              ? "bg-[#dcfce7] text-[#15803d]"
              : "bg-[#f4ebff] text-[#6941c6]"
          }`}
        >
          {completed ? <CheckCircle2 className="h-5 w-5" /> : icon}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold leading-[22px] text-[#171717]">
              {title}
            </h3>
            {label && !completed ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#6941c6] ring-1 ring-[#e9d7fe]">
                {label}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[14px] leading-[20px] text-[#525252]">
            {description}
          </p>
        </div>
      </div>
      <div className="mt-4">
        {completed ? (
          <div className="inline-flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-[14px] font-semibold text-[#15803d] ring-1 ring-[#bbf7d0]">
            <CheckCircle2 className="h-4 w-4" />
            {completedLabel}
          </div>
        ) : (
          action
        )}
      </div>
    </div>
  );
}
