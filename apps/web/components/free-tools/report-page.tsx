"use client";

import { useId, useState } from "react";
import { Flag, Loader2 } from "lucide-react";

import { ANONYMOUS_REPORT_REASONS, type AnonymousReportReason } from "@opendocs/shared/config/free-tools";
import { HoneypotField } from "@/components/free-tools/honeypot-field";
import { trackEvent } from "@/lib/analytics";
import { API_BASE_URL } from "@/lib/config/api";
import { apiErrorMessage, useBotCheck } from "@/lib/free-tools/client";

/**
 * "Report this page" on anonymous pages (/a/<id>). Posts to
 * /api/v1/anonymous/:id/report from the reader's browser, so the API
 * counts the reader's address (reports from several addresses hide the
 * page; see FREE_TOOL_LIMITS.reports).
 */
export function ReportPage({ docId }: { docId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<AnonymousReportReason | "">("");
  const [details, setDetails] = useState("");
  const [state, setState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const { honeypotRef, botFields } = useBotCheck();
  const formId = useId();

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (state.kind === "sending") return;
    if (!reason) {
      setState({ kind: "error", message: "Pick a reason first." });
      return;
    }
    setState({ kind: "sending" });
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/anonymous/${encodeURIComponent(docId)}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details.trim() || undefined, ...botFields() }),
      });
      if (!res.ok) {
        setState({ kind: "error", message: await apiErrorMessage(res, "We couldn't send the report. Try again.") });
        return;
      }
      setState({ kind: "sent" });
      void trackEvent("anonymous_report", { reason });
    } catch {
      setState({ kind: "error", message: "We couldn't reach OpenDocs. Check your connection and try again." });
    }
  }

  if (state.kind === "sent") {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400" role="status">
        Thanks for the report. We&apos;ll take a look.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-zinc-500 underline-offset-4 hover:text-zinc-900 hover:underline dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        <Flag aria-hidden="true" className="h-3.5 w-3.5" />
        Report this page
      </button>
    );
  }

  return (
    <form
      onSubmit={send}
      aria-labelledby={`${formId}-title`}
      className="w-full basis-full rounded-xl border border-zinc-200 bg-white p-4 text-sm dark:border-white/10 dark:bg-zinc-900"
    >
      <p id={`${formId}-title`} className="font-semibold text-zinc-900 dark:text-zinc-50">
        Report this page
      </p>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">
        Pages reported by several readers are hidden until we&apos;ve reviewed them.
      </p>
      <fieldset className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <legend className="sr-only">Reason</legend>
        {(Object.entries(ANONYMOUS_REPORT_REASONS) as Array<[AnonymousReportReason, string]>).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="radio"
              name="reason"
              value={value}
              checked={reason === value}
              onChange={() => {
                setReason(value);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              className="accent-[#7F56D9]"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="mt-3 block text-sm text-zinc-700 dark:text-zinc-300">
        Anything else we should know? (optional)
        <textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={500}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
        />
      </label>
      <HoneypotField inputRef={honeypotRef} />
      {state.kind === "error" ? (
        <p className="mt-2 text-red-700 dark:text-red-400" role="alert">
          {state.message}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={state.kind === "sending"}
          className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-1.5 font-semibold text-white hover:bg-zinc-700 disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900"
        >
          {state.kind === "sending" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          Send report
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setState({ kind: "idle" });
          }}
          className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
