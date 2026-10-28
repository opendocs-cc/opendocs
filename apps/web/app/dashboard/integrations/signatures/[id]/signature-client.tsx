"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertTriangle, ArrowLeft, Download, FileText, Send } from "lucide-react";
import { toast } from "sonner";

import type { SignatureRequestView } from "@opendocs/shared/integrations/signatures";

import { cancelSignatureAction, sendSignatureAction } from "../../actions";
import { RequestStatusBadge } from "../../integrations-client";

const primaryButton =
  "inline-flex items-center justify-center gap-2 bg-[#7F56D9] hover:bg-[#6941C6] disabled:opacity-50 text-white text-[14px] font-semibold px-4 py-2.5 rounded-[8px] transition-colors shadow-sm border border-[#7F56D9]";
const secondaryButton =
  "inline-flex items-center justify-center gap-2 bg-white hover:bg-[#fafafa] disabled:opacity-50 text-[#404040] text-[14px] font-semibold px-3.5 py-2 rounded-[8px] transition-colors shadow-sm border border-[#d4d4d4]";

const SIGNER_STATUS: Record<string, string> = {
  draft: "Not sent",
  awaiting: "Waiting for earlier signers",
  sent: "Email sent",
  opened: "Opened",
  completed: "Signed",
  declined: "Declined",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-4 py-2.5">
      <dt className="text-[13px] text-[#737373]">{label}</dt>
      <dd className="text-[14px] text-[#171717] min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function SignatureRequestClient({
  request,
  outsideEmails,
}: {
  request: SignatureRequestView;
  outsideEmails: string[];
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [checked, setChecked] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const isDraft = request.status === "draft";
  const fileUrl = (kind: string) => `/dashboard/integrations/signatures/${request.id}/file?kind=${kind}`;

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, success: string) =>
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.message ?? "Something went wrong.");
      // A failed send records why on the request; show it.
      router.refresh();
    });

  return (
    <div className="max-w-[800px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-6">
      <Link
        href="/dashboard/integrations"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#525252] hover:text-[#171717] self-start"
      >
        <ArrowLeft className="w-4 h-4" />
        Integrations
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold text-[#171717]">
            {isDraft ? "Review and send for signature" : request.document.title}
          </h1>
          <p className="text-[15px] text-[#525252] mt-1">
            {isDraft
              ? "Nothing has been sent yet. Check the document and every name and email address before you send it."
              : `Version ${request.document.versionNumber}, sent with DocuSeal${request.sentAt ? ` on ${formatDate(request.sentAt)}` : ""}.`}
          </p>
        </div>
        <RequestStatusBadge status={request.status} />
      </div>

      <section className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm p-5">
        <div className="flex items-start gap-3">
          <FileText className="w-5 h-5 text-[#a3a3a3] mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#171717]">
              {request.document.title} <span className="font-normal text-[#737373]">v{request.document.versionNumber}</span>
            </p>
            <p className="text-[12px] text-[#737373] font-mono truncate" title={request.document.sha256}>
              SHA-256 {request.document.sha256}
            </p>
          </div>
          {isDraft && (
            <a href={fileUrl("draft")} target="_blank" rel="noreferrer" className={secondaryButton}>
              Open PDF
            </a>
          )}
        </div>

        <dl className="mt-4 divide-y divide-[#f0f0f0] border-t border-[#f0f0f0]">
          <Row label="Order">
            {request.order === "parallel"
              ? "Everyone gets the email at the same time"
              : "One after another, in this order"}
          </Row>
          {request.message?.subject && <Row label="Email subject">{request.message.subject}</Row>}
          {request.message?.body && <Row label="Email message"><span className="whitespace-pre-wrap">{request.message.body}</span></Row>}
          {request.expiresAt && <Row label="Expires">{formatDate(request.expiresAt)}</Row>}
          {request.fileTo && (
            <Row label="File to">
              Google Drive folder &ldquo;{request.fileTo.name ?? "removed folder"}&rdquo; once everyone has signed
            </Row>
          )}
        </dl>
      </section>

      <section className="bg-white border border-[#e5e5e5] rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-[#e5e5e5] bg-[#fafafa]">
          <h2 className="text-[13px] font-semibold text-[#404040]">Signers</h2>
        </div>
        <ol className="divide-y divide-[#f0f0f0]">
          {request.signers.map((s, i) => (
            <li key={`${s.email}-${i}`} className="px-5 py-3 flex items-center gap-4">
              <span className="w-6 h-6 rounded-full bg-[#F4F3FF] text-[#5925DC] text-[12px] font-semibold flex items-center justify-center shrink-0">
                {request.order === "parallel" ? "•" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-[#171717] truncate">{s.name}</p>
                <p className="text-[13px] text-[#525252] truncate">{s.email}</p>
                {s.role && <p className="text-[12px] text-[#737373] truncate">Signs as: {s.role}</p>}
                {s.declineReason && <p className="text-[12px] text-[#B42318]">Declined: {s.declineReason}</p>}
              </div>
              <span className="text-[12px] text-[#525252] text-right shrink-0">
                {SIGNER_STATUS[s.status] ?? s.status}
                {s.completedAt && <span className="block text-[#737373]">{formatDate(s.completedAt)}</span>}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {isDraft && outsideEmails.length > 0 && (
        <div className="flex gap-3 bg-[#FFFAEB] border border-[#FEDF89] rounded-xl px-4 py-3">
          <AlertTriangle className="w-5 h-5 text-[#DC6803] shrink-0 mt-0.5" />
          <p className="text-[14px] text-[#93370D]">
            {outsideEmails.join(", ")} {outsideEmails.length === 1 ? "is" : "are"} outside your workspace&apos;s email
            domains. Make sure {outsideEmails.length === 1 ? "it's" : "they're"} spelled right.
          </p>
        </div>
      )}

      {request.lastError && (
        <p className="text-[14px] text-[#B42318] bg-[#FEF3F2] border border-[#FECDCA] rounded-xl px-4 py-3">
          The last attempt to send failed: {request.lastError}
        </p>
      )}

      {isDraft && (
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 accent-[#7F56D9]"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span className="text-[14px] text-[#404040]">
              I&apos;ve checked the document and the names and email addresses above. DocuSeal will email{" "}
              {request.order === "parallel" ? "every signer now" : "the first signer now"}.
            </span>
          </label>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              className="text-[13px] font-medium text-[#525252] hover:text-[#171717] disabled:opacity-50 self-start"
              disabled={busy}
              onClick={() => act(() => cancelSignatureAction(request.id), "Draft discarded")}
            >
              Discard draft
            </button>
            <button
              type="button"
              className={primaryButton}
              disabled={!checked || busy}
              onClick={() => act(() => sendSignatureAction(request.id), "Sent for signature")}
            >
              <Send className="w-4 h-4 opacity-80" />
              {busy ? "Sending…" : `Send to ${request.signers.length} signer${request.signers.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}

      {request.status === "pending" && (
        <div className="flex items-center gap-3">
          {confirmCancel ? (
            <>
              <button
                type="button"
                className="text-[13px] font-semibold text-[#B42318] hover:text-[#912018] disabled:opacity-50"
                disabled={busy}
                onClick={() => act(() => cancelSignatureAction(request.id), "Request cancelled")}
              >
                Cancel it: signers can no longer open it
              </button>
              <button type="button" className="text-[13px] text-[#525252]" onClick={() => setConfirmCancel(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button type="button" className="text-[13px] font-medium text-[#B42318]" onClick={() => setConfirmCancel(true)}>
              Cancel request
            </button>
          )}
        </div>
      )}

      {request.status === "completed" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <a href={fileUrl("signed")} className={primaryButton}>
              <Download className="w-4 h-4" />
              Signed PDF
            </a>
            <a href={fileUrl("audit")} className={secondaryButton}>
              <Download className="w-4 h-4" />
              Audit log
            </a>
          </div>
          {request.filed && (
            <p className="text-[13px] text-[#525252]">
              Filed to &ldquo;{(request.filed as { destination?: { name?: string } }).destination?.name}&rdquo; in Google
              Drive.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
