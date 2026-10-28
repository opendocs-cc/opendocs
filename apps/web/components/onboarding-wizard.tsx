"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  ChevronRight,
  User,
  Building2,
  Rocket,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { API_BASE_URL } from "@/lib/config/api";
import { trackEvent } from "@/lib/analytics";
import { trackAdRegistration } from "@/lib/ad-tracking/client";
import { PLAN_LIMITS } from "@opendocs/shared/billing/plan-limits";
import { instanceHost } from "@opendocs/shared/config/instance";

import { Button } from "@/components/ui/button";

type OnboardingWizardProps = {
  isInvitedUser: boolean;
  initialEmail?: string | null;
  initialName?: string | null;
  /** Where to go when setup is done, e.g. back to /claim/<token>. */
  nextUrl?: string | null;
};

// Derive a slug from a display name: "Jane Doe" → "janedoe", "My Company" → "my-company"
function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_ ]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

const INPUT_CLASS =
  "w-full border border-[#d4d4d4] rounded-[8px] px-[14px] py-[10px] text-[16px] text-[#171717] placeholder:text-[#737373] outline-none focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] transition-all";

const MAX_ONBOARDING_INVITES = Math.max(
  0,
  PLAN_LIMITS.free.membersPerWorkspace - 1,
);
const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 32;

const ownerSteps = [
  { number: 1, title: "Your Profile", icon: User },
  { number: 2, title: "Create Workspace", icon: Building2 },
  { number: 3, title: "Get Started", icon: Rocket },
];

export function OnboardingWizard({
  isInvitedUser,
  initialEmail,
  initialName,
  nextUrl,
}: OnboardingWizardProps) {
  const router = useRouter();
  const doneUrl = nextUrl ?? "/dashboard";

  const [currentStep, setCurrentStep] = useState(1);
  const [username, setUsername] = useState(() => slugify(initialName ?? ""));
  // Prefill full name from the auth provider (Google/GitHub return
  // `session.user.name`). Email signups don't carry a separate display
  // name today, so this falls back to empty and the user fills it in.
  const [fullName, setFullName] = useState(initialName ?? "");
  const [workspaceName, setWorkspaceName] = useState("");
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugCheckReason, setSlugCheckReason] = useState<string | null>(null);
  const [apiKeyPlaintext, setApiKeyPlaintext] = useState<string | null>(null);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);
  const [inviteEmails, setInviteEmails] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const usernameTooShort =
    username.length > 0 && username.length < MIN_USERNAME_LENGTH;
  const usernameValid = username.length >= MIN_USERNAME_LENGTH;

  // Animation direction for step transitions
  const [animDirection, setAnimDirection] = useState<"forward" | "back">("forward");
  // Key to force re-mount of step content for entrance animation
  const [stepKey, setStepKey] = useState(0);

  // Debounced slug availability check
  const slugCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkSlugAvailability = useCallback((slug: string) => {
    if (slugCheckTimer.current) clearTimeout(slugCheckTimer.current);
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      setSlugCheckReason(null);
      return;
    }
    slugCheckTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/v1/workspace/check-slug?slug=${encodeURIComponent(slug)}`,
          { credentials: "include" },
        );
        const data = (await res.json()) as { available: boolean; reason?: string };
        setSlugAvailable(data.available);
        setSlugCheckReason(data.available ? null : (data.reason ?? "Not available."));
      } catch {
        setSlugAvailable(null);
        setSlugCheckReason(null);
      }
    }, 400);
  }, []);

  const handleUsernameChange = (value: string) => {
    setUsername(
      value
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "")
        .slice(0, MAX_USERNAME_LENGTH),
    );
  };

  // Auto-derive workspace slug from workspace name (unless user manually edited)
  useEffect(() => {
    if (!slugManuallyEdited) {
      const derived = slugify(workspaceName);
      setWorkspaceSlug(derived);
      checkSlugAvailability(derived);
    }
  }, [workspaceName, slugManuallyEdited, checkSlugAvailability]);

  const goToStep = (step: number) => {
    setAnimDirection(step > currentStep ? "forward" : "back");
    setStepKey((k) => k + 1);
    setCurrentStep(step);
  };

  // -----------------------------------------------------------------------
  // Invited user flow — single step: choose username + full name
  // -----------------------------------------------------------------------
  if (isInvitedUser) {
    const handleFinish = () => {
      if (!usernameValid) return;
      setIsPending(true);
      setError(null);

      startTransition(async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/onboarding`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username,
              fullName: fullName.trim() || undefined,
            }),
          });

          const payload = (await response.json()) as {
            message?: string;
            error?: string;
            adEventId?: string;
          };

          if (!response.ok) {
            throw new Error(
              payload.message ?? "Unable to complete onboarding.",
            );
          }

          trackEvent("Onboarding Complete", { type: "invited" });
          trackAdRegistration(payload.adEventId);
          router.push(doneUrl);
          router.refresh();
        } catch (err) {
          setError(
            err instanceof Error ? err.message : "Something went wrong.",
          );
        } finally {
          setIsPending(false);
        }
      });
    };

    return (
      <div className="w-full max-w-[520px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-8">
          <h1 className="text-[20px] font-semibold text-[#171717] mb-2">
            Welcome to OpenDocs
          </h1>
          <p className="text-[16px] text-[#525252]">
            Tell us your name and pick a username to finish setup
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-5 sm:p-6 md:p-8">
          <div className="mb-6">
            <h2 className="text-[18px] font-semibold text-[#171717] mb-2">
              Your Profile
            </h2>
            <p className="text-[14px] text-[#525252]">
              Shown alongside your username on documents you publish.
            </p>
          </div>

          <div className="mb-5">
            <label htmlFor="fullName" className="mb-2 block text-[14px] font-medium text-[#171717]">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              placeholder="Jane Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus={!fullName}
              autoComplete="name"
              className={INPUT_CLASS}
            />
          </div>

          <div className="mb-6">
            <label htmlFor="username" className="mb-2 block text-[14px] font-medium text-[#171717]">
              Username
            </label>
            <input
              id="username"
              type="text"
              placeholder="janedoe"
              value={username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && usernameValid && handleFinish()}
              autoFocus={Boolean(fullName)}
              autoComplete="off"
              className={INPUT_CLASS}
            />
            <p
              className={`text-[12px] mt-1.5 ${
                usernameTooShort ? "text-[#DC2626]" : "text-[#737373]"
              }`}
            >
              {usernameTooShort
                ? "Username must be at least 3 characters."
                : "Lowercase letters, numbers, hyphens, and underscores. 3-32 characters."}
            </p>
          </div>

          {error && (
            <p className="text-[14px] text-[#DC2626] mb-4">{error}</p>
          )}

          <Button
            onClick={handleFinish}
            disabled={isPending || !usernameValid}
            className="w-full bg-[#7F56D9] hover:bg-[#6941C6] text-white"
          >
            {isPending ? "Finishing..." : "Finish Setup"}
          </Button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Owner flow — 3-step wizard
  // -----------------------------------------------------------------------

  const handleStep1Submit = () => {
    if (!usernameValid) return;
    setError(null);
    goToStep(2);
  };

  const handleStep2Submit = () => {
    if (!workspaceName.trim() || !workspaceSlug.trim()) return;
    if (slugAvailable === false) return;
    setIsPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/onboarding`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            fullName: fullName.trim() || undefined,
            workspaceName,
            workspaceSlug,
          }),
        });

        const payload = await response.json();

        if (!response.ok) {
          throw new Error(
            payload.message ?? "Unable to complete setup.",
          );
        }

        // Store the auto-generated API key for step 3
        if (payload.apiKey?.plaintext) {
          setApiKeyPlaintext(payload.apiKey.plaintext);
        }

        // Remember the freshly-created workspace id so Step 3's "invite
        // teammates" step can target the right workspace explicitly,
        // rather than relying on the server to infer it.
        if (payload.workspace?.id) {
          setCreatedWorkspaceId(payload.workspace.id);
        }

        trackEvent("Onboarding Complete", { type: "owner" });
        trackAdRegistration(
          typeof payload.adEventId === "string" ? payload.adEventId : undefined,
        );
        goToStep(3);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const handleCopyApiKey = () => {
    if (apiKeyPlaintext) {
      navigator.clipboard.writeText(apiKeyPlaintext);
      toast.success("API key copied to clipboard");
    }
  };

  const handleEmailChange = (index: number, value: string) => {
    const updated = [...inviteEmails];
    updated[index] = value;
    setInviteEmails(updated);
  };

  const handleAddEmailField = () => {
    if (inviteEmails.length >= MAX_ONBOARDING_INVITES) return;
    setInviteEmails([...inviteEmails, ""]);
  };

  const handleRemoveEmailField = (index: number) => {
    setInviteEmails(inviteEmails.filter((_, i) => i !== index));
  };

  const handleSendInvitesAndFinish = async () => {
    const validEmails = inviteEmails
      .filter(
        (email) =>
          email.trim() &&
          email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/),
      )
      .slice(0, MAX_ONBOARDING_INVITES);

    if (validEmails.length > 0 && createdWorkspaceId) {
      setIsPending(true);

      try {
        const results = await Promise.allSettled(
          validEmails.map(async (email) => {
            const res = await fetch(`${API_BASE_URL}/api/v1/workspace/team/invite`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspaceId: createdWorkspaceId,
                email: email.trim().toLowerCase(),
                role: "member",
              }),
            });
            if (!res.ok) throw new Error("invite failed");
            return res;
          }),
        );

        const sent = results.filter((r) => r.status === "fulfilled").length;
        if (sent > 0) {
          toast.success(
            `Invitation${sent > 1 ? "s" : ""} sent to ${sent} team member${sent > 1 ? "s" : ""}`,
          );
        }
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed > 0) {
          toast.error(
            `${failed} invitation${failed > 1 ? "s" : ""} could not be sent`,
          );
        }
      } catch {
        // Non-fatal — invites can be sent from the team page later
      } finally {
        setIsPending(false);
      }
    }

    router.push(doneUrl);
    router.refresh();
  };

  const handleSkipToFinish = () => {
    router.push(doneUrl);
    router.refresh();
  };

  // Animation class for step content
  const stepAnimClass =
    animDirection === "forward"
      ? "animate-in fade-in slide-in-from-right-6 duration-400"
      : "animate-in fade-in slide-in-from-left-6 duration-400";

  return (
    <div className="w-full max-w-[580px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-[20px] font-semibold text-[#171717] mb-2">
          Welcome to OpenDocs
        </h1>
        <p className="text-[16px] text-[#525252]">
          Let&apos;s get your workspace set up in just a few steps
        </p>
      </div>

      {/* Progress Steps — fixed-width steps with flex connectors */}
      <div className="mb-8 px-2 sm:px-4">
        <div className="flex items-start justify-center">
          {ownerSteps.map((step, index) => (
            <div key={step.number} className="contents">
              <div className="flex flex-col items-center w-[80px] sm:w-[120px] shrink-0">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    currentStep > step.number
                      ? "bg-[#7F56D9] text-white scale-100"
                      : currentStep === step.number
                        ? "bg-[#7F56D9] text-white ring-4 ring-[#f4ebff] scale-110"
                        : "bg-[#f5f5f5] text-[#a3a3a3] scale-100"
                  }`}
                >
                  {currentStep > step.number ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <step.icon className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={`text-[11px] sm:text-[12px] mt-2 truncate max-w-full px-1 transition-colors duration-300 ${
                    currentStep >= step.number
                      ? "text-[#171717] font-medium"
                      : "text-[#a3a3a3]"
                  }`}
                >
                  {step.title}
                </span>
              </div>
              {index < ownerSteps.length - 1 && (
                <div className="flex-1 flex items-center min-w-[12px]" style={{ marginTop: 20 }}>
                  <div className="w-full h-0.5 relative overflow-hidden bg-[#e5e5e5] rounded-full">
                    <div
                      className="absolute inset-y-0 left-0 bg-[#7F56D9] rounded-full transition-all duration-500 ease-out"
                      style={{ width: currentStep > step.number ? "100%" : "0%" }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl border border-[#e5e5e5] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] p-5 sm:p-6 md:p-8">
        {/* Step 1: Your Profile */}
        {currentStep === 1 && (
          <div key={stepKey} className={stepAnimClass}>
            <div className="mb-6">
              <h2 className="text-[18px] font-semibold text-[#171717] mb-2">Your Profile</h2>
              <p className="text-[14px] text-[#525252]">
                Tell us your name and pick a username. Both appear as
                attribution when you publish documents.
              </p>
            </div>

            <div className="space-y-4 mb-6">
              <div>
                <label htmlFor="fullName" className="mb-2 block text-[14px] font-medium text-[#171717]">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus={!fullName}
                  autoComplete="name"
                  className={INPUT_CLASS}
                />
                <p className="text-[12px] text-[#737373] mt-1.5">
                  Your real name, shown next to your username on documents.
                </p>
              </div>
              <div>
                <label htmlFor="username" className="mb-2 block text-[14px] font-medium text-[#171717]">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  placeholder="janedoe"
                  value={username}
                  onChange={(e) => handleUsernameChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && usernameValid && handleStep1Submit()}
                  autoFocus={Boolean(fullName)}
                  autoComplete="off"
                  className={INPUT_CLASS}
                />
                <p
                  className={`text-[12px] mt-1.5 ${
                    usernameTooShort ? "text-[#DC2626]" : "text-[#737373]"
                  }`}
                >
                  {usernameTooShort
                    ? "Username must be at least 3 characters."
                    : "Lowercase letters, numbers, hyphens, and underscores. 3-32 characters."}
                </p>
              </div>
            </div>

            {error && (
              <p className="text-[14px] text-[#DC2626] mb-4">{error}</p>
            )}

            <Button
              onClick={handleStep1Submit}
              disabled={!usernameValid}
              className="w-full bg-[#7F56D9] hover:bg-[#6941C6] text-white h-[44px] text-[15px]"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 2: Create Workspace */}
        {currentStep === 2 && (
          <div key={stepKey} className={stepAnimClass}>
            <div className="mb-6">
              <h2 className="text-[18px] font-semibold text-[#171717] mb-2">Create Your Workspace</h2>
              <p className="text-[14px] text-[#525252]">
                Your workspace is the home for your team&apos;s documents. The workspace
                ID becomes part of every document URL.
              </p>
            </div>

            <div className="space-y-5 mb-6">
              <div>
                <label htmlFor="workspace-name" className="mb-2 block text-[14px] font-medium text-[#171717]">
                  Workspace Name
                </label>
                <input
                  id="workspace-name"
                  type="text"
                  placeholder="My Company"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  className={INPUT_CLASS}
                />
                <p className="text-[12px] text-[#737373] mt-1.5">
                  A display name for your team. You can change this later.
                </p>
              </div>

              <div>
                <label htmlFor="workspace-slug" className="mb-2 block text-[14px] font-medium text-[#171717]">
                  Workspace ID
                </label>
                <input
                  id="workspace-slug"
                  type="text"
                  placeholder="my-company"
                  value={workspaceSlug}
                  autoComplete="off"
                  onChange={(e) => {
                    setSlugManuallyEdited(true);
                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
                    setWorkspaceSlug(val);
                    checkSlugAvailability(val);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handleStep2Submit()}
                  className={INPUT_CLASS}
                />
                {/* Live URL preview */}
                <div className="mt-2 px-3 py-2.5 bg-[#fafafa] border border-[#e5e5e5] rounded-lg">
                  <p className="text-[13px] text-[#525252] font-mono break-all sm:break-normal">
                    {instanceHost()}/<span className="text-[#7F56D9] font-semibold">{workspaceSlug || "your-workspace"}</span>/your-doc
                  </p>
                </div>
                {/* Availability indicator */}
                {workspaceSlug.length >= 3 && slugAvailable === true && (
                  <p className="text-[12px] text-green-600 mt-1.5 flex items-center gap-1 animate-in fade-in duration-200">
                    <Check className="w-3 h-3" /> Available
                  </p>
                )}
                {workspaceSlug.length >= 3 && slugAvailable === false && slugCheckReason && (
                  <p className="text-[12px] text-[#DC2626] mt-1.5 animate-in fade-in duration-200">{slugCheckReason}</p>
                )}
              </div>
            </div>

            {error && (
              <p className="text-[14px] text-[#DC2626] mb-4">{error}</p>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={() => { setError(null); goToStep(1); }}
                className="w-full sm:w-auto px-5 py-2.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-[#fafafa] transition-colors"
              >
                Back
              </button>
              <Button
                onClick={handleStep2Submit}
                disabled={isPending || !workspaceName.trim() || !workspaceSlug.trim() || slugAvailable === false}
                className="w-full sm:flex-1 bg-[#7F56D9] hover:bg-[#6941C6] text-white h-[44px] text-[15px]"
              >
                {isPending ? "Creating..." : "Create Workspace"}
                {!isPending && <ChevronRight className="w-4 h-4 ml-2" />}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Get Started (API key + invite) */}
        {currentStep === 3 && (
          <div key={stepKey} className={stepAnimClass}>
            <div className="mb-6">
              <h2 className="text-[18px] font-semibold text-[#171717] mb-2">Get Started</h2>
              <p className="text-[14px] text-[#525252]">
                Your workspace is ready! Here&apos;s your API key and an option to
                invite your team.
              </p>
            </div>

            {/* API Key section */}
            <div className="mb-6">
              <label htmlFor="api-key" className="mb-2 block text-[14px] font-medium text-[#171717]">
                API Key
              </label>
              <div className="flex gap-2">
                <input
                  id="api-key"
                  type="text"
                  value={apiKeyPlaintext ?? ""}
                  readOnly
                  autoComplete="off"
                  className={`${INPUT_CLASS} min-w-0 flex-1 font-mono text-[13px] bg-[#fafafa]`}
                />
                <button
                  onClick={handleCopyApiKey}
                  className="shrink-0 w-[44px] h-[44px] border border-[#d4d4d4] rounded-[8px] flex items-center justify-center text-[#525252] hover:bg-[#fafafa] transition-colors"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[12px] text-[#737373] mt-1.5">
                Keep this key secure. You can generate new keys from the API Keys page.
              </p>
            </div>

            <div className="mb-6 p-4 bg-[#f0ebfa] border border-[#d6c8f0] rounded-lg">
              <div className="flex items-start gap-3">
                <Sparkles className="w-5 h-5 text-[#7F56D9] mt-0.5 flex-shrink-0" />
                <div>
                  <h3 className="text-[14px] font-medium text-[#171717] mb-1">
                    Quick Setup with AI Agents
                  </h3>
                  <p className="text-[13px] text-[#525252]">
                    Tell your AI agent to set up the OpenDocs integration using
                    the official <strong>OpenDocs SKILL.md</strong>. Your agent
                    will handle the configuration automatically.
                  </p>
                </div>
              </div>
            </div>

            {/* Invite section */}
            <div className="mb-6">
              <label className="mb-2 block text-[14px] font-medium text-[#171717]">
                Invite Team Members{" "}
                <span className="text-[#a3a3a3] font-normal">(optional)</span>
              </label>
              <p className="text-[12px] text-[#737373] -mt-1 mb-3">
                Invite up to {MAX_ONBOARDING_INVITES} teammate
                {MAX_ONBOARDING_INVITES === 1 ? "" : "s"} now. You can manage
                members later from the Team page.
              </p>
              <div className="space-y-3">
                {inviteEmails.map((email, index) => (
                  <div key={index} className="flex gap-2 animate-in fade-in slide-in-from-top-2 duration-200">
                    <input
                      type="email"
                      placeholder="teammate@example.com"
                      value={email}
                      onChange={(e) => handleEmailChange(index, e.target.value)}
                      autoComplete="off"
                      className={`${INPUT_CLASS} min-w-0 flex-1`}
                    />
                    {inviteEmails.length > 1 && (
                      <button
                        onClick={() => handleRemoveEmailField(index)}
                        className="shrink-0 w-[44px] h-[44px] border border-[#d4d4d4] rounded-[8px] flex items-center justify-center text-[#525252] hover:bg-[#fafafa] transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {inviteEmails.length < MAX_ONBOARDING_INVITES && (
                <button
                  onClick={handleAddEmailField}
                  className="mt-3 px-3 py-1.5 border border-[#d4d4d4] rounded-[8px] text-[13px] font-medium text-[#525252] hover:bg-[#fafafa] transition-colors"
                >
                  + Add Another
                </button>
              )}
            </div>

            <div className="flex flex-col-reverse sm:flex-row gap-3">
              <button
                onClick={handleSkipToFinish}
                className="w-full sm:flex-1 px-4 py-2.5 border border-[#d4d4d4] rounded-[8px] text-[14px] font-medium text-[#404040] hover:bg-[#fafafa] transition-colors"
              >
                {nextUrl ? "Skip & Continue" : "Skip & Go to Dashboard"}
              </button>
              <Button
                onClick={handleSendInvitesAndFinish}
                disabled={isPending}
                className="w-full sm:flex-1 bg-[#7F56D9] hover:bg-[#6941C6] text-white h-[44px] text-[15px]"
              >
                {isPending ? "Sending..." : "Send Invites & Finish"}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Step counter */}
      <div className="text-center mt-6">
        <p className="text-[13px] text-[#a3a3a3]">
          Step {currentStep} of {ownerSteps.length}
        </p>
      </div>
    </div>
  );
}
