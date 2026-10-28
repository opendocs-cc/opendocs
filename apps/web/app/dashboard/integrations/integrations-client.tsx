"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { Check, Copy, ExternalLink, FolderPlus, Pencil, PenLine, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/dashboard/page-header";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  addFolderAction,
  connectDocuSealAction,
  disconnectAction,
  getPickerConfigAction,
  removeFolderAction,
  renameFolderAction,
  saveWebhookSecretAction,
  updateSettingsAction,
} from "./actions";
import { pickDriveFolder } from "./drive-picker";

type ConnectionStatus = "connected" | "not_connected" | "error";
type Settings = { usableBy: "members" | "admins"; signatureConfirmation: "chat" | "browser" };
type Folder = { id: string; name: string; folderName: string | null; driveName: string | null; url: string | null };
type RequestRow = {
  id: string;
  title: string;
  versionNumber: number;
  status: string;
  signers: Array<{ name: string; email: string; status: string }>;
  createdAt: string;
};

type IntegrationsClientProps = {
  workspaceId: string;
  workspaceName: string;
  canManage: boolean;
  canUse: boolean;
  settings: Settings;
  drive: {
    status: ConnectionStatus;
    account: string | null;
    error: string | null;
    destinations: Folder[];
    configured: boolean;
    pickerConfigured: boolean;
  };
  docuseal: {
    status: ConnectionStatus;
    account: string | null;
    error: string | null;
    region: string | null;
    webhookUrl: string | null;
    hasWebhookSecret: boolean;
  };
  requests: RequestRow[];
  flash: { connected: string | null; error: string | null };
};

const FLASH_ERRORS: Record<string, string> = {
  oauth_state: "The Google sign-in expired or was started elsewhere. Try connecting again.",
  google_denied: "Google Drive access wasn't granted.",
  google_not_configured: "Google Drive isn't set up on this server yet.",
  scope_not_granted: "OpenDocs needs the Google Drive permission. Connect again and leave the Drive checkbox ticked.",
  no_refresh_token: "Google didn't grant offline access. Connect again.",
  oauth_failed: "Connecting Google Drive failed. Try again.",
  plan_required: "Integrations are part of the Pro and Team plans.",
  forbidden: "Only workspace owners and admins can connect integrations.",
};

const primaryButton =
  "inline-flex items-center justify-center gap-2 bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-50 text-white text-[14px] font-semibold px-4 py-2 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 bg-white hover:bg-[#fafafa] disabled:opacity-50 text-[#404040] text-[14px] font-semibold px-3.5 py-2 rounded-[8px] transition-colors shadow-sm border border-[#d4d4d4]";
const dangerLink = "text-[13px] font-medium text-[#B42318] hover:text-[#912018] disabled:opacity-50";
const input =
  "w-full px-3 py-2 text-[14px] border border-[#d4d4d4] rounded-[8px] focus:outline-none focus:ring-2 focus:ring-[#7F56D9] focus:border-[#7F56D9] text-[#171717] placeholder:text-[#a3a3a3] shadow-sm bg-white";

function Section({ title, description, children, last }: { title: string; description: ReactNode; children: ReactNode; last?: boolean }) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 md:gap-8 ${last ? "" : "pb-8 border-b border-[#e5e5e5]"}`}>
      <div>
        <h2 className="text-[14px] font-semibold text-[#171717] mb-1.5">{title}</h2>
        <div className="text-[14px] text-[#525252] leading-relaxed md:pr-4">{description}</div>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm p-5 flex flex-col gap-4">{children}</div>;
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
  const styles: Record<ConnectionStatus, [string, string]> = {
    connected: ["Connected", "bg-[#ECFDF3] text-[#067647] border-[#ABEFC6]"],
    error: ["Needs reconnecting", "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]"],
    not_connected: ["Not connected", "bg-[#fafafa] text-[#525252] border-[#e5e5e5]"],
  };
  const [label, cls] = styles[status];
  return <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

const REQUEST_STATUS: Record<string, [string, string]> = {
  draft: ["Waiting for confirmation", "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]"],
  sending: ["Sending", "bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]"],
  pending: ["Out for signature", "bg-[#F4F3FF] text-[#5925DC] border-[#D9D6FE]"],
  completed: ["Signed", "bg-[#ECFDF3] text-[#067647] border-[#ABEFC6]"],
  declined: ["Declined", "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]"],
  expired: ["Expired", "bg-[#fafafa] text-[#525252] border-[#e5e5e5]"],
  cancelled: ["Cancelled", "bg-[#fafafa] text-[#525252] border-[#e5e5e5]"],
  failed: ["Failed", "bg-[#FEF3F2] text-[#B42318] border-[#FECDCA]"],
};

export function RequestStatusBadge({ status }: { status: string }) {
  const [label, cls] = REQUEST_STATUS[status] ?? [status, "bg-[#fafafa] text-[#525252] border-[#e5e5e5]"];
  return <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{label}</span>;
}

function IntegrationsHeader() {
  return (
    <PageHeader
      title="Integrations"
      description="Connect the tools your workspace uses. Ask your agent to save a document to a Drive folder, or to send it for signature."
    />
  );
}

export function UpgradePrompt() {
  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
      <IntegrationsHeader />
      <div className="w-full h-px bg-[#e5e5e5]" />
      <div className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-10 h-10 rounded-full bg-[#F4F3FF] flex items-center justify-center shrink-0">
          <Sparkles className="w-5 h-5 text-[#7F56D9]" />
        </div>
        <div className="flex-1">
          <p className="text-[15px] font-semibold text-[#171717]">Integrations are part of Pro and Team</p>
          <p className="text-[14px] text-[#525252] mt-0.5">
            Save documents to Google Drive and send them for e-signature with DocuSeal, straight from your agent.
          </p>
        </div>
        <Link href="/dashboard/billing" className={primaryButton}>
          Upgrade
        </Link>
      </div>
    </div>
  );
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className={`${input} font-mono text-[12px]`} onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className={secondaryButton}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        aria-label="Copy"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  disabled,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={dangerLink} onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-3">
      <button
        type="button"
        className={`${dangerLink} font-semibold`}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        disabled={disabled}
      >
        {confirmLabel}
      </button>
      <button type="button" className="text-[13px] text-[#525252] hover:text-[#171717]" onClick={() => setAsking(false)}>
        Keep
      </button>
    </span>
  );
}

// ---- Google Drive -------------------------------------------------------

function DriveFolders({
  workspaceId,
  folders,
  canManage,
  pickerConfigured,
  busy,
  run,
}: {
  workspaceId: string;
  folders: Folder[];
  canManage: boolean;
  pickerConfigured: boolean;
  busy: boolean;
  run: (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) => void;
}) {
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [opening, setOpening] = useState(false);

  async function openPicker() {
    setOpening(true);
    try {
      const config = await getPickerConfigAction(workspaceId);
      if (!config.ok) {
        toast.error(config.message);
        return;
      }
      const folder = await pickDriveFolder(config);
      if (folder) {
        setPicked(folder);
        setNewName(folder.name);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open the folder picker.");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-[#404040]">Folders</p>
        {canManage && (
          <button
            type="button"
            className={secondaryButton}
            onClick={openPicker}
            disabled={busy || opening || !pickerConfigured}
            title={pickerConfigured ? undefined : "The Google Picker isn't configured on this server."}
          >
            <FolderPlus className="w-4 h-4" />
            {opening ? "Opening…" : "Add folder"}
          </button>
        )}
      </div>

      {picked && (
        <form
          className="border border-[#D9D6FE] bg-[#F9F8FF] rounded-[10px] p-3 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const result = await addFolderAction(workspaceId, { folderId: picked.id, name: newName });
              if (result.ok) setPicked(null);
              return result;
            }, `Added "${newName}"`);
          }}
        >
          <label className="text-[13px] text-[#404040]">
            Name agents use for <span className="font-medium">{picked.name}</span>
          </label>
          <div className="flex gap-2">
            <input className={input} value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={80} autoFocus />
            <button type="submit" className={primaryButton} disabled={busy || !newName.trim()}>
              Save
            </button>
            <button type="button" className={secondaryButton} onClick={() => setPicked(null)} aria-label="Cancel">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[12px] text-[#737373]">
            For example: &ldquo;Contracts&rdquo;. Then ask your agent to &ldquo;save this to Contracts&rdquo;.
          </p>
        </form>
      )}

      {folders.length === 0 && !picked ? (
        <p className="text-[14px] text-[#737373]">
          {canManage
            ? "No folders yet. Add the folders people should be able to save into; agents can only use folders added here."
            : "No folders yet. An owner or admin can add them."}
        </p>
      ) : (
        <ul className="divide-y divide-[#f0f0f0] border border-[#e5e5e5] rounded-[10px]">
          {folders.map((f) => (
            <li key={f.id} className="px-3 py-2.5 flex items-center gap-3">
              {editing === f.id ? (
                <form
                  className="flex gap-2 flex-1"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const result = await renameFolderAction(workspaceId, f.id, editName);
                      if (result.ok) setEditing(null);
                      return result;
                    }, "Renamed");
                  }}
                >
                  <input className={input} value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={80} autoFocus />
                  <button type="submit" className={primaryButton} disabled={busy || !editName.trim()}>
                    Save
                  </button>
                  <button type="button" className={secondaryButton} onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-[#171717] truncate">{f.name}</p>
                    <p className="text-[12px] text-[#737373] truncate">
                      {[f.driveName ?? "My Drive", f.folderName].filter(Boolean).join(" / ")}
                    </p>
                  </div>
                  {f.url && (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-[#737373] hover:text-[#171717]" aria-label="Open in Drive">
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  )}
                  {canManage && (
                    <>
                      <button
                        type="button"
                        className="text-[#737373] hover:text-[#171717]"
                        onClick={() => {
                          setEditing(f.id);
                          setEditName(f.name);
                        }}
                        aria-label="Rename"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="text-[#737373] hover:text-[#B42318] disabled:opacity-50"
                        onClick={() => run(() => removeFolderAction(workspaceId, f.id), `Removed "${f.name}"`)}
                        disabled={busy}
                        aria-label="Remove"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---- DocuSeal -----------------------------------------------------------

function DocuSealConnectForm({ workspaceId, busy, run }: { workspaceId: string; busy: boolean; run: IntegrationsRun }) {
  const [region, setRegion] = useState<"com" | "eu" | "custom">("com");
  const [customUrl, setCustomUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const consoleUrl =
    region === "eu"
      ? "https://console.docuseal.eu/api"
      : region === "custom"
        ? null
        : "https://console.docuseal.com/api";

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const result = await connectDocuSealAction(workspaceId, { region, customUrl, apiKey });
          if (result.ok) setApiKey("");
          return result;
        }, "DocuSeal connected");
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[13px] font-medium text-[#404040]">Account region</label>
          <Select value={region} onValueChange={(v) => setRegion(v as typeof region)}>
            <SelectTrigger className="w-full h-auto px-3 py-2 text-[14px] border border-[#d4d4d4] rounded-[8px] bg-white shadow-sm text-[#171717]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="dashboard-light">
              <SelectItem value="com">docuseal.com</SelectItem>
              <SelectItem value="eu">docuseal.eu</SelectItem>
              <SelectItem value="custom">Self-hosted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {region === "custom" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium text-[#404040]">Instance address</label>
            <input
              className={input}
              placeholder="https://sign.example.com"
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              inputMode="url"
            />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-[13px] font-medium text-[#404040]">API key</label>
        <input
          className={`${input} font-mono`}
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your DocuSeal API key"
        />
        <p className="text-[12px] text-[#737373]">
          {consoleUrl ? (
            <>
              Find it at{" "}
              <a href={consoleUrl} target="_blank" rel="noreferrer" className="underline">
                {consoleUrl.replace("https://", "")}
              </a>
              .{" "}
            </>
          ) : (
            "Find it in your instance's settings under API. "
          )}
          The API needs a DocuSeal Pro plan; DocuSeal bills each document sent through it.
        </p>
      </div>
      <div>
        <button type="submit" className={primaryButton} disabled={busy || !apiKey.trim() || (region === "custom" && !customUrl.trim())}>
          {busy ? "Checking…" : "Connect DocuSeal"}
        </button>
      </div>
    </form>
  );
}

function DocuSealWebhook({
  workspaceId,
  webhookUrl,
  hasWebhookSecret,
  busy,
  run,
}: {
  workspaceId: string;
  webhookUrl: string;
  hasWebhookSecret: boolean;
  busy: boolean;
  run: IntegrationsRun;
}) {
  const [secret, setSecret] = useState("");
  return (
    <div className="flex flex-col gap-3 border-t border-[#f0f0f0] pt-4">
      <div>
        <p className="text-[13px] font-medium text-[#404040]">Webhook (recommended)</p>
        <p className="text-[12px] text-[#737373] mt-0.5">
          So signatures show up here right away: in DocuSeal, open Webhooks, add this URL with the form and submission
          events, and paste its signing secret below. Without it, OpenDocs checks DocuSeal when someone looks at a request.
        </p>
      </div>
      <CopyField value={webhookUrl} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const result = await saveWebhookSecretAction(workspaceId, secret);
            if (result.ok) setSecret("");
            return result;
          }, "Signing secret saved");
        }}
      >
        <input
          className={`${input} font-mono`}
          type="password"
          autoComplete="off"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder={hasWebhookSecret ? "Signing secret saved. Paste a new one to replace it." : "Signing secret (whsec_…)"}
        />
        <button type="submit" className={secondaryButton} disabled={busy || !secret.trim()}>
          Save
        </button>
      </form>
    </div>
  );
}

// ---- Settings -----------------------------------------------------------

function Choice<T extends string>({
  name,
  value,
  options,
  disabled,
  onChange,
}: {
  name: string;
  value: T;
  options: Array<{ value: T; label: string; description: string }>;
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex gap-3 border rounded-[10px] px-3.5 py-3 ${
            value === o.value ? "border-[#7F56D9] bg-[#F9F8FF]" : "border-[#e5e5e5] bg-white"
          } ${disabled ? "opacity-70" : "cursor-pointer"}`}
        >
          <input
            type="radio"
            name={name}
            className="mt-1 accent-[#7F56D9]"
            checked={value === o.value}
            disabled={disabled}
            onChange={() => onChange(o.value)}
          />
          <span>
            <span className="block text-[14px] font-medium text-[#171717]">{o.label}</span>
            <span className="block text-[13px] text-[#525252]">{o.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

// ---- Page ---------------------------------------------------------------

type IntegrationsRun = (fn: () => Promise<{ ok: boolean; message?: string }>, success?: string) => void;

export function IntegrationsClient({
  workspaceId,
  workspaceName,
  canManage,
  canUse,
  settings: initialSettings,
  drive,
  docuseal,
  requests,
  flash,
}: IntegrationsClientProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    if (flash.connected === "google_drive") toast.success("Google Drive connected");
    if (flash.error) toast.error(FLASH_ERRORS[flash.error] ?? "Something went wrong. Try again.");
    if (flash.connected || flash.error) router.replace("/dashboard/integrations", { scroll: false });
  }, [flash.connected, flash.error, router]);

  const run: IntegrationsRun = (fn, success) => {
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        toast.error(result.message ?? "Something went wrong.");
        return;
      }
      if (success) toast.success(success);
      router.refresh();
    });
  };

  const saveSetting = (next: Partial<Settings>) => {
    const previous = settings;
    setSettings({ ...settings, ...next });
    startTransition(async () => {
      const result = await updateSettingsAction(workspaceId, next);
      if (!result.ok) {
        setSettings(previous);
        toast.error(result.message);
      }
    });
  };

  return (
    <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-[32px]">
      <IntegrationsHeader />
      <div className="w-full h-px bg-[#e5e5e5]" />

      {!canUse && (
        <div className="bg-[#FFFAEB] border border-[#FEDF89] rounded-xl px-4 py-3 text-[14px] text-[#93370D]">
          In {workspaceName}, only owners and admins can use integrations.
        </div>
      )}

      <Section
        title="Google Drive"
        description={
          <>
            Save documents as PDF, Word or Markdown into folders you choose, including shared drives. Nothing is saved
            unless someone asks. OpenDocs only sees the folders added here and the files it creates.
          </>
        }
      >
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-semibold text-[#171717]">Google Drive</p>
                <StatusBadge status={drive.status} />
              </div>
              {drive.account && <p className="text-[13px] text-[#525252] mt-0.5 truncate">{drive.account}</p>}
            </div>
            {canManage && drive.status !== "not_connected" && (
              <ConfirmButton
                label="Disconnect"
                confirmLabel="Disconnect and forget folders"
                disabled={busy}
                onConfirm={() => run(() => disconnectAction(workspaceId, "google_drive"), "Google Drive disconnected")}
              />
            )}
          </div>

          {drive.status === "error" && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#FEF3F2] border border-[#FECDCA] rounded-[10px] px-3 py-2.5">
              <p className="text-[13px] text-[#B42318] flex-1">
                {drive.error ?? "Google revoked OpenDocs' access."} Reconnect with the same account to keep your folders.
              </p>
              {canManage && (
                <a href="/dashboard/integrations/google-drive/connect" className={secondaryButton}>
                  Reconnect
                </a>
              )}
            </div>
          )}

          {drive.status === "not_connected" ? (
            canManage ? (
              drive.configured ? (
                <div>
                  <a href="/dashboard/integrations/google-drive/connect" className={primaryButton}>
                    Connect Google Drive
                  </a>
                  <p className="text-[12px] text-[#737373] mt-2">
                    Use the Google account that can add files to your shared drives. It&apos;s used for everyone in{" "}
                    {workspaceName}.
                  </p>
                </div>
              ) : (
                <p className="text-[14px] text-[#737373]">Google Drive isn&apos;t set up on this server yet.</p>
              )
            ) : (
              <p className="text-[14px] text-[#737373]">Not connected. An owner or admin can connect it.</p>
            )
          ) : (
            <DriveFolders
              workspaceId={workspaceId}
              folders={drive.destinations}
              canManage={canManage}
              pickerConfigured={drive.pickerConfigured}
              busy={busy}
              run={run}
            />
          )}
        </Card>
      </Section>

      <Section
        title="DocuSeal"
        description={
          <>
            Send documents for e-signature with your own DocuSeal account. Signers get an email from DocuSeal; the signed
            PDF and its audit log come back here.
          </>
        }
      >
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-[15px] font-semibold text-[#171717]">DocuSeal</p>
                <StatusBadge status={docuseal.status} />
              </div>
              {docuseal.status !== "not_connected" && (
                <p className="text-[13px] text-[#525252] mt-0.5 truncate">
                  {[docuseal.account, docuseal.region === "custom" ? "self-hosted" : `docuseal.${docuseal.region ?? "com"}`]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
            </div>
            {canManage && docuseal.status !== "not_connected" && (
              <ConfirmButton
                label="Disconnect"
                confirmLabel="Disconnect DocuSeal"
                disabled={busy}
                onConfirm={() => run(() => disconnectAction(workspaceId, "docuseal"), "DocuSeal disconnected")}
              />
            )}
          </div>

          {docuseal.status === "error" && (
            <p className="text-[13px] text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-[10px] px-3 py-2.5">
              {docuseal.error ?? "DocuSeal rejected the API key."} {canManage ? "Paste a new key below." : ""}
            </p>
          )}

          {canManage && docuseal.status !== "connected" && <DocuSealConnectForm workspaceId={workspaceId} busy={busy} run={run} />}
          {!canManage && docuseal.status === "not_connected" && (
            <p className="text-[14px] text-[#737373]">Not connected. An owner or admin can connect it.</p>
          )}
          {canManage && docuseal.status !== "not_connected" && docuseal.webhookUrl && (
            <DocuSealWebhook
              workspaceId={workspaceId}
              webhookUrl={docuseal.webhookUrl}
              hasWebhookSecret={docuseal.hasWebhookSecret}
              busy={busy}
              run={run}
            />
          )}
        </Card>
      </Section>

      <Section
        title="Settings"
        description={canManage ? "Who can use integrations, and how signature requests get sent." : "Set by owners and admins."}
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-[#404040]">Who can use integrations</p>
            <Choice
              name="usableBy"
              value={settings.usableBy}
              disabled={!canManage || busy}
              onChange={(usableBy) => saveSetting({ usableBy })}
              options={[
                { value: "members", label: "Every member", description: "Anyone in the workspace can save to folders and send for signature." },
                { value: "admins", label: "Owners and admins only", description: "Members can still read and publish documents." },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-medium text-[#404040]">Confirming signature requests</p>
            <Choice
              name="signatureConfirmation"
              value={settings.signatureConfirmation}
              disabled={!canManage || busy}
              onChange={(signatureConfirmation) => saveSetting({ signatureConfirmation })}
              options={[
                {
                  value: "chat",
                  label: "In chat",
                  description: "Your agent shows the document, names and emails, and sends once you say yes.",
                },
                {
                  value: "browser",
                  label: "In the browser",
                  description: "Agents prepare requests; a person reviews and sends each one here in OpenDocs.",
                },
              ]}
            />
          </div>
        </div>
      </Section>

      {canUse && (
        <Section title="Signature requests" description="The latest 50 in this workspace." last>
          {requests.length === 0 ? (
            <p className="text-[14px] text-[#737373]">
              None yet. Ask your agent to &ldquo;send the services agreement to Dana Whitfield, dana@halvard.example, for signing&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-[#f0f0f0] border border-[#e5e5e5] rounded-xl bg-white shadow-sm overflow-hidden">
              {requests.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/integrations/signatures/${r.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa] transition-colors"
                  >
                    <PenLine className="w-4 h-4 text-[#a3a3a3] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-[#171717] truncate">
                        {r.title} <span className="text-[#737373] font-normal">v{r.versionNumber}</span>
                      </p>
                      <p className="text-[12px] text-[#737373] truncate">
                        {r.signers.map((s) => s.name).join(", ")} · {new Date(r.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <RequestStatusBadge status={r.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
    </div>
  );
}
