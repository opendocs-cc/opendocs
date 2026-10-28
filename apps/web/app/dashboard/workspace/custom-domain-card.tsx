"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  ChevronDown,
  CircleDashed,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { instanceHost } from "@opendocs/shared/config/instance";

import { FormRow } from "@/components/form-row";
import { SettingsCard } from "@/components/dashboard/settings-card";
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
import { Switch } from "@/components/ui/switch";
import { API_BASE_URL } from "@/lib/config/api";

// Mirrors CustomDomainView in packages/shared/src/custom-domains/service.ts.
type RecordCheck = "ok" | "missing" | "mismatch" | "conflict" | "proxied" | "error";
type DomainState = "pending" | "verifying" | "active" | "misconfigured" | "paused";
type DomainRecord = {
  type: "CNAME" | "A" | "TXT";
  name: string;
  host: string;
  value: string;
  purpose: "routing" | "verification";
  check: RecordCheck | null;
};
type CustomDomain = {
  hostname: string;
  kind: "subdomain" | "apex";
  status: "pending" | "active" | "misconfigured";
  state: DomainState;
  serving: boolean;
  url: string;
  records: DomainRecord[];
  lastError: { code: string; message: string } | null;
  consecutiveFailures: number;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  failingSince: string | null;
  showPoweredBy: boolean;
};
type DomainResponse = { domain: CustomDomain | null; plan: { tier: string; allowed: boolean } };

const STATE_BADGES: Record<DomainState, { label: string; className: string }> = {
  pending: { label: "Waiting for DNS", className: "bg-[#FFFAEB] text-[#B54708] ring-[#FEDF89]" },
  verifying: { label: "Verifying", className: "bg-[#EFF8FF] text-[#175CD3] ring-[#B2DDFF]" },
  active: { label: "Active", className: "bg-[#ECFDF3] text-[#067647] ring-[#ABEFC6]" },
  misconfigured: { label: "Misconfigured", className: "bg-[#FEF3F2] text-[#B42318] ring-[#FECDCA]" },
  paused: { label: "Paused", className: "bg-[#F5F5F5] text-[#525252] ring-[#E5E5E5]" },
};

// While a domain waits for DNS the card checks again on its own: every
// 30 seconds for 10 minutes after the page opens (the API allows 12 checks
// a minute, and the background job carries on after that).
const POLL_INTERVAL_MS = 30_000;
const POLL_ATTEMPTS = 20;

function relativeTime(iso: string | null) {
  if (!iso) return null;
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it instead.");
        }
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-[6px] p-[6px] text-[#737373] transition-colors hover:bg-[#f5f5f5] hover:text-[#171717]"
      title={`Copy ${label}`}
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="h-[14px] w-[14px] text-[#067647]" /> : <Copy className="h-[14px] w-[14px]" />}
    </button>
  );
}

function CheckIcon({ check }: { check: RecordCheck | null }) {
  if (check === null) return <CircleDashed className="h-4 w-4 text-[#a3a3a3]" aria-label="Not checked yet" />;
  if (check === "ok") return <Check className="h-4 w-4 text-[#067647]" aria-label="Found" />;
  if (check === "error") return <CircleDashed className="h-4 w-4 text-[#a3a3a3]" aria-label="Couldn't check" />;
  return <X className="h-4 w-4 text-[#B42318]" aria-label="Not found or wrong" />;
}

/**
 * A prompt for the user's AI agent that adds the records: many people find
 * DNS confusing, and agents can usually find the DNS provider and either do
 * it (CLI, API, a signed-in browser) or walk them through it.
 */
function agentSetupPrompt(domain: CustomDomain) {
  const routing = domain.records.find((record) => record.purpose === "routing");
  const txt = domain.records.find((record) => record.purpose === "verification");
  if (!routing || !txt) return "";
  // notes.example.com with host "notes" → example.com
  const zone = routing.name.startsWith(`${routing.host}.`) ? routing.name.slice(routing.host.length + 1) : routing.name;
  return `Please help me connect ${domain.hostname} to OpenDocs, where I publish documents. It needs two DNS records, added wherever the DNS for ${zone} is managed.

1. CNAME record
   Name: ${routing.host}   (full name: ${routing.name})
   Target: ${routing.value}
2. TXT record
   Name: ${txt.host}   (full name: ${txt.name})
   Value: ${txt.value}

How to do it:
- Find out where the DNS for ${zone} is managed: run \`dig NS ${zone} +short\` (or \`nslookup -type=NS ${zone}\`). The nameservers name the provider, for example Cloudflare, GoDaddy, Namecheap, DigitalOcean or AWS Route 53. That's not always the registrar where the domain was bought.
- If you can reach that provider (its CLI, an API token, or a browser I'm signed in to), add the records there. Otherwise walk me through it in their dashboard, one step at a time.
- Some providers want only the part before the domain in the name field (${routing.host} and ${txt.host}), others the full name. Don't end up with the domain twice, like ${txt.name}.${zone}.
- On Cloudflare, set the CNAME to "DNS only" (grey cloud), not proxied.
- If a record already exists for ${domain.hostname} (an old CNAME or A record), ask me before changing it. Leave all other records alone.
- Keep both records after the domain works: OpenDocs checks them every 6 hours.

Then check they're live (it can take a few minutes):
  dig +short CNAME ${domain.hostname} @1.1.1.1    should print ${routing.value}.
  dig +short TXT ${txt.name} @1.1.1.1    should print "${txt.value}"
When both are right, tell me to click "Check now" in OpenDocs (Workspace settings, Custom domain).`;
}

/** "Copy prompt for your agent", for domains whose records aren't in place. */
function AgentSetupHelp({ domain }: { domain: CustomDomain }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const prompt = agentSetupPrompt(domain);
  if (!prompt) return null;
  return (
    <div className="rounded-lg border border-[#E9D7FE] bg-[#F9F5FF] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2.5">
          <Bot className="mt-0.5 h-4 w-4 shrink-0 text-[#6941C6]" aria-hidden="true" />
          <div>
            <p className="text-[14px] font-medium text-[#42307D]">Let your AI agent add the records</p>
            <p className="mt-0.5 text-[13px] leading-[19px] text-[#6941C6]">
              Paste this into Claude, ChatGPT or another agent. It finds your DNS provider and adds the records, or
              walks you through it.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
              toast.success("Prompt copied");
              window.setTimeout(() => setCopied(false), 1600);
            } catch {
              setOpen(true);
              toast.error("Couldn't copy. Select the prompt and copy it instead.");
            }
          }}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-[8px] bg-[#7F56D9] px-3.5 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#6941C6]"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          Copy prompt for your agent
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mt-2 inline-flex items-center gap-1 text-[13px] font-medium text-[#6941C6] hover:text-[#53389E]"
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide prompt" : "Show prompt"}
      </button>
      {open ? (
        <pre className="mt-2 max-h-[320px] overflow-auto whitespace-pre-wrap rounded-md border border-[#E9D7FE] bg-white p-3 font-mono text-[12px] leading-[18px] text-[#344054]">
          {prompt}
        </pre>
      ) : null}
    </div>
  );
}

async function readJson(res: Response) {
  return (await res.json().catch(() => null)) as (DomainResponse & { message?: string; error?: string }) | null;
}

/**
 * Workspace settings → Custom domain. Owners and admins connect a domain,
 * add the DNS records it shows, and watch the status; members see it read
 * only. Free workspaces get the Pro badge and the upgrade dialog.
 */
export function CustomDomainCard({
  workspaceId,
  workspaceSlug,
  isAdmin,
  isFreePlan,
  proBadge,
  onUpgrade,
}: {
  workspaceId: string;
  workspaceSlug: string;
  isAdmin: boolean;
  isFreePlan: boolean;
  proBadge: ReactNode;
  onUpgrade: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [domain, setDomain] = useState<CustomDomain | null>(null);
  const [hostnameInput, setHostnameInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [savingFooter, setSavingFooter] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const pollsLeft = useRef(POLL_ATTEMPTS);
  const endpoint = `${API_BASE_URL}/api/v1/workspace/domain`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${endpoint}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        credentials: "include",
      });
      const data = await readJson(res);
      if (res.ok && data) setDomain(data.domain);
    } finally {
      setLoading(false);
    }
  }, [endpoint, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const check = useCallback(
    async (quiet = false) => {
      setChecking(true);
      try {
        const res = await fetch(`${endpoint}/check`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId }),
        });
        const data = await readJson(res);
        if (!res.ok) {
          if (!quiet) toast.error(data?.message ?? "Couldn't check the domain");
          return;
        }
        setDomain(data?.domain ?? null);
        if (!quiet && data?.domain) {
          if (data.domain.status === "active" && !data.domain.lastError) toast.success("Records found");
          else toast.message("Not there yet", { description: data.domain.lastError?.message });
        }
      } finally {
        setChecking(false);
      }
    },
    [endpoint, workspaceId],
  );

  // Keep checking while the records haven't shown up yet.
  useEffect(() => {
    if (!isAdmin || domain?.state !== "pending") return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible" || pollsLeft.current <= 0) return;
      pollsLeft.current -= 1;
      void check(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [isAdmin, domain?.state, check]);

  const connect = async () => {
    if (!isAdmin || saving) return;
    if (isFreePlan) {
      onUpgrade();
      return;
    }
    setInputError(null);
    setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, hostname: hostnameInput }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        if (data?.error === "plan_required") {
          onUpgrade();
          return;
        }
        if (data?.error === "invalid_hostname" || data?.error === "domain_taken") {
          setInputError(data.message ?? "That domain can't be used.");
          return;
        }
        throw new Error(data?.message ?? "Couldn't save the domain");
      }
      pollsLeft.current = POLL_ATTEMPTS;
      setDomain(data?.domain ?? null);
      setHostnameInput("");
      toast.success("Domain saved. Add the DNS records below.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save the domain");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`${endpoint}?workspaceId=${encodeURIComponent(workspaceId)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.message ?? "Couldn't remove the domain");
      setDomain(null);
      setConfirmRemove(false);
      toast.success("Domain removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't remove the domain");
    } finally {
      setRemoving(false);
    }
  };

  const setShowPoweredBy = async (showPoweredBy: boolean) => {
    if (!domain) return;
    const previous = domain;
    setDomain({ ...domain, showPoweredBy });
    setSavingFooter(true);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, showPoweredBy }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data?.message ?? "Couldn't save the setting");
      if (data?.domain) setDomain(data.domain);
      toast.success(showPoweredBy ? "The footer says Published with OpenDocs" : "OpenDocs is hidden from the footer");
    } catch (err) {
      setDomain(previous);
      toast.error(err instanceof Error ? err.message : "Couldn't save the setting");
    } finally {
      setSavingFooter(false);
    }
  };

  const badge = domain ? STATE_BADGES[domain.state] : null;
  const lastChecked = relativeTime(domain?.lastCheckedAt ?? null);
  const failingSince = domain?.failingSince ? new Date(domain.failingSince) : null;
  const routingRecords = domain?.records.filter((record) => record.purpose === "routing") ?? [];
  const txtRecord = domain?.records.find((record) => record.purpose === "verification");

  return (
    <SettingsCard
      id="custom-domain"
      title="Custom domain"
      description="Serve this workspace's documents on your own domain, like notes.yourcompany.com."
    >
      {loading ? (
        <div className="flex items-center gap-2 py-6 text-[14px] text-[#737373]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading
        </div>
      ) : !domain ? (
        <FormRow
          title="Domain"
          description="A subdomain such as notes.yourcompany.com (root domains like yourcompany.com aren't supported). You'll get two DNS records to add."
          titleBadge={isFreePlan ? proBadge : null}
        >
          <form
            className="flex max-w-[480px] flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              void connect();
            }}
          >
            <input
              type="text"
              inputMode="url"
              value={hostnameInput}
              onChange={(event) => {
                setHostnameInput(event.target.value);
                setInputError(null);
              }}
              disabled={!isAdmin || saving}
              placeholder="notes.yourcompany.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={inputError ? true : undefined}
              className="w-full min-w-0 flex-1 rounded-[8px] border border-[#d4d4d4] px-[14px] py-[10px] text-[16px] text-[#171717] outline-none transition-all placeholder:text-[#737373] focus:border-[#6941c6] focus:ring-4 focus:ring-[#f4ebff] disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-[#a3a3a3]"
            />
            <button
              type="submit"
              disabled={!isAdmin || saving || (!isFreePlan && !hostnameInput.trim())}
              className="w-full rounded-[8px] bg-[#7F56D9] px-4 py-2 text-[14px] font-semibold text-white transition-colors hover:bg-[#6941C6] disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {saving ? "Connecting..." : "Connect domain"}
            </button>
          </form>
          {inputError ? <p className="mt-2 text-[13px] text-[#B42318]">{inputError}</p> : null}
          {!isAdmin ? (
            <p className="mt-1.5 text-[13px] text-[#a3a3a3]">
              Only workspace owners and admins can connect a custom domain.
            </p>
          ) : null}
        </FormRow>
      ) : (
        <div className="flex flex-col gap-5 py-5">
          {/* Domain and status */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-all text-[16px] font-semibold text-[#171717]">{domain.hostname}</p>
                {badge ? (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ring-1 ring-inset ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 max-w-[620px] text-[14px] leading-[20px] text-[#525252]">
                {domain.state === "pending" &&
                  "Add the records below at your DNS provider. Changes can take a few minutes to a few hours to show up; this page checks again on its own."}
                {domain.state === "verifying" &&
                  "Records found. The HTTPS certificate is issued on the first visit, which takes a few seconds."}
                {domain.state === "active" &&
                  `Documents are served on ${domain.hostname}, and links to ${instanceHost()}/${workspaceSlug} redirect there.`}
                {domain.state === "misconfigured" &&
                  `The records were changed or removed, so OpenDocs stopped serving this domain${
                    failingSince ? ` (failing since ${failingSince.toLocaleDateString("en-US", { month: "short", day: "numeric" })})` : ""
                  }. Your documents are still on ${instanceHost()}/${workspaceSlug}.`}
                {domain.state === "paused" &&
                  `Paused: custom domains need Pro. Visitors are sent to ${instanceHost()}/${workspaceSlug} until you upgrade.`}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {domain.serving ? (
                <a
                  href={domain.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#d4d4d4] px-3 py-1.5 text-[14px] font-medium text-[#404040] transition-colors hover:bg-[#fafafa]"
                >
                  Visit
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : null}
              {domain.state === "paused" && isAdmin ? (
                <button
                  type="button"
                  onClick={onUpgrade}
                  className="rounded-[8px] bg-[#7F56D9] px-3 py-1.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#6941C6]"
                >
                  Upgrade
                </button>
              ) : null}
            </div>
          </div>

          {/* What went wrong */}
          {domain.lastError && domain.state !== "paused" ? (
            <div
              className={`flex gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-[19px] ${
                domain.state === "misconfigured" || domain.status === "active"
                  ? "border-[#FECDCA] bg-[#FEF3F2] text-[#912018]"
                  : "border-[#FEDF89] bg-[#FFFAEB] text-[#93370D]"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p>{domain.lastError.message}</p>
                {domain.status === "active" && !domain.serving ? (
                  <p className="mt-1 opacity-80">
                    Until it's fixed, readers use {instanceHost()}/{workspaceSlug} as before: links there no longer
                    redirect to {domain.hostname}. Fix the record and click Check now to switch back.
                  </p>
                ) : domain.status === "active" && domain.consecutiveFailures > 0 ? (
                  <p className="mt-1 opacity-80">
                    The domain still works for now. After three failed checks in a row it stops serving.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* DNS records */}
          <div>
            <p className="text-[14px] font-medium text-[#404040]">DNS records</p>
            <div className="mt-2 overflow-hidden rounded-lg border border-[#e5e5e5]">
              <div className="hidden grid-cols-[72px_minmax(0,1fr)_minmax(0,1.3fr)_28px] gap-3 border-b border-[#e5e5e5] bg-[#fafafa] px-3 py-2 text-[12px] font-medium uppercase tracking-wide text-[#737373] sm:grid">
                <span>Type</span>
                <span>Name</span>
                <span>Value</span>
                <span className="sr-only">Status</span>
              </div>
              {[...routingRecords, ...(txtRecord ? [txtRecord] : [])].map((record) => (
                <div
                  key={`${record.type}-${record.value}`}
                  className="grid grid-cols-[minmax(0,1fr)_24px] gap-x-3 gap-y-1.5 border-b border-[#f0f0f0] px-3 py-3 last:border-b-0 sm:grid-cols-[72px_minmax(0,1fr)_minmax(0,1.3fr)_28px] sm:items-center"
                >
                  <span className="text-[13px] font-semibold text-[#171717] sm:font-medium">
                    {record.type}
                    <span className="font-normal text-[#737373] sm:hidden">
                      {record.purpose === "routing" ? " · sends visitors here" : " · proves the domain is yours"}
                    </span>
                  </span>
                  <span className="row-span-3 flex items-start justify-end sm:order-last sm:row-span-1 sm:justify-center">
                    <CheckIcon check={record.check} />
                  </span>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="w-12 shrink-0 text-[12px] text-[#a3a3a3] sm:hidden">Name</span>
                    <code className="min-w-0 break-all font-mono text-[13px] text-[#404040]">{record.name}</code>
                    <CopyValue value={record.name} label={`${record.type} name`} />
                  </div>
                  <div className="flex min-w-0 items-center gap-1">
                    <span className="w-12 shrink-0 text-[12px] text-[#a3a3a3] sm:hidden">Value</span>
                    <code className="min-w-0 break-all font-mono text-[13px] text-[#404040]">{record.value}</code>
                    <CopyValue value={record.value} label={`${record.type} value`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-col gap-1.5 text-[13px] leading-[19px] text-[#737373]">
              {routingRecords[0] && routingRecords[0].host !== routingRecords[0].name ? (
                <p>
                  Some providers want only the part before your domain:{" "}
                  <code className="font-mono text-[#404040]">{routingRecords[0].host}</code> and{" "}
                  <code className="font-mono text-[#404040]">{txtRecord?.host}</code>.
                </p>
              ) : null}
              <p>
                Keep both records after the domain is active: OpenDocs checks them every 6 hours, and the domain
                stops serving after three failed checks in a row.
              </p>
              <p>
                On Cloudflare, set the CNAME to{" "}
                <span className="font-medium text-[#525252]">DNS only</span> (grey cloud). A proxied record stops
                OpenDocs from issuing the certificate.
              </p>
            </div>
          </div>

          {isAdmin && (domain.state === "pending" || domain.state === "misconfigured") ? (
            <AgentSetupHelp domain={domain} />
          ) : null}

          {/* White label: the footer's one mention of OpenDocs */}
          <div className="flex flex-col gap-3 border-t border-[#f0f0f0] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[14px] font-medium text-[#404040]">Show &ldquo;Published with OpenDocs&rdquo;</p>
              <p className="mt-0.5 max-w-[520px] text-[13px] leading-[19px] text-[#737373]">
                The one line in the footer of {domain.hostname} that mentions OpenDocs. Turn it off for a fully
                white-label site.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={domain.showPoweredBy}
                onCheckedChange={(checked) => void setShowPoweredBy(checked)}
                disabled={!isAdmin || savingFooter || domain.state === "paused"}
                className="data-[state=checked]:bg-[#7F56D9]"
                aria-label="Show Published with OpenDocs in the footer"
              />
              <span className="text-[14px] text-[#525252]">{domain.showPoweredBy ? "Shown" : "Hidden"}</span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col-reverse gap-3 border-t border-[#f0f0f0] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-[#a3a3a3]">
              {lastChecked ? `Last checked ${lastChecked}. ` : ""}Checked again every 6 hours.
            </p>
            {isAdmin ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void check()}
                  disabled={checking}
                  className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#d4d4d4] px-4 py-2 text-[14px] font-medium text-[#404040] transition-colors hover:bg-[#fafafa] disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                  {checking ? "Checking..." : "Check now"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#fca5a5] px-4 py-2 text-[14px] font-semibold text-[#b91c1c] transition-colors hover:bg-[#fef2f2]"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>
            ) : (
              <p className="text-[13px] text-[#a3a3a3]">Only workspace owners and admins can change the custom domain.</p>
            )}
          </div>
        </div>
      )}

      <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
        <AlertDialogContent className="dashboard-light">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {domain?.hostname}?</AlertDialogTitle>
            <AlertDialogDescription>
              The domain stops serving straight away and {instanceHost()} links stop redirecting to it. Readers signed in
              on the domain are signed out. You can connect it again later; it gets a new verification record.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void remove();
              }}
              disabled={removing}
              className="bg-[#dc2626] hover:bg-[#b91c1c]"
            >
              {removing ? "Removing..." : "Remove domain"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsCard>
  );
}
