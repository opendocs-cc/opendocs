"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, Copy, Download, ExternalLink, Loader2 } from "lucide-react";

import { HoneypotField } from "@/components/free-tools/honeypot-field";
import { trackEvent } from "@/lib/analytics";
import { API_BASE_URL } from "@/lib/config/api";
import {
  ANONYMOUS_MAX_BYTES,
  FreeToolError,
  apiErrorMessage,
  byteLength,
  convertMarkdown,
  downloadBlob,
  filenameFromMarkdown,
  formatBytes,
  takeDraftForPublish,
  useBotCheck,
} from "@/lib/free-tools/client";

/**
 * Paste Markdown, get a link: the tool on /tools/publish-markdown-online
 * (and /try). Publishes through the anonymous API, the same one behind
 * `opendocs publish --anonymous`: the link works for 24 hours, and the claim
 * link keeps it after signing up.
 *
 * After publishing, editing the text and clicking "Update the link" changes
 * the same page (PUT with the claim token) instead of making a new one.
 */
type Published = {
  id: string;
  url: string;
  claimToken: string;
  claimUrl: string;
  expiresAt: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "publishing" }
  | { kind: "error"; message: string };

export function AnonymousPublishTool({ sample, signedIn }: { sample: string; signedIn: boolean }) {
  const [text, setText] = useState(sample);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [published, setPublished] = useState<Published | null>(null);
  const [publishedText, setPublishedText] = useState<string | null>(null);
  const textareaId = useId();
  const resultRef = useRef<HTMLDivElement>(null);
  const { honeypotRef, botFields } = useBotCheck();

  // Text handed over from a converter's "Publish it as a link".
  useEffect(() => {
    const draft = takeDraftForPublish();
    if (draft) setText(draft);
  }, []);

  const bytes = byteLength(text);
  const tooLarge = bytes > ANONYMOUS_MAX_BYTES;
  const busy = status.kind === "publishing";
  const changedSincePublish = published !== null && text !== publishedText;

  async function publish() {
    if (busy) return;
    if (!text.trim()) {
      setStatus({ kind: "error", message: "Write or paste some Markdown first." });
      return;
    }
    if (tooLarge) {
      setStatus({
        kind: "error",
        message: "Anonymous links take up to 512 KB of Markdown. Sign up free to publish bigger documents.",
      });
      return;
    }

    const updating = published !== null;
    setStatus({ kind: "publishing" });
    void trackEvent(updating ? "anonymous_update_start" : "anonymous_publish_start", { tool: "publish-markdown-online" });
    try {
      const res = updating
        ? await fetch(`${API_BASE_URL}/api/v1/anonymous/${published.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", "X-OpenDocs-Client": "web/try" },
            body: JSON.stringify({ markdown: text, claimToken: published.claimToken }),
          })
        : await fetch(`${API_BASE_URL}/api/v1/anonymous/publish`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-OpenDocs-Client": "web/try" },
            body: JSON.stringify({ markdown: text, ...botFields() }),
          });
      if (!res.ok) {
        // The API's 429 text is written for agents (it names the CLI).
        const message =
          res.status === 429
            ? "You've hit the limit for publishing without an account from this address. Try again later, or sign up free to keep publishing."
            : await apiErrorMessage(res, "Something went wrong publishing your Markdown.");
        setStatus({ kind: "error", message });
        void trackEvent(updating ? "anonymous_update_error" : "anonymous_publish_error", { status: res.status });
        return;
      }
      const body = (await res.json()) as Partial<Published>;
      setPublished((current) => ({
        id: body.id ?? current!.id,
        url: body.url ?? current!.url,
        expiresAt: body.expiresAt ?? current!.expiresAt,
        claimToken: body.claimToken ?? current!.claimToken,
        claimUrl: body.claimUrl ?? current!.claimUrl,
      }));
      setPublishedText(text);
      setStatus({ kind: "idle" });
      if (!updating) {
        // On a phone the result lands below the fold.
        window.requestAnimationFrame(() =>
          resultRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }),
        );
      }
      void trackEvent(updating ? "anonymous_update_success" : "anonymous_publish_success", {
        tool: "publish-markdown-online",
      });
    } catch {
      setStatus({ kind: "error", message: "We couldn't reach OpenDocs. Check your connection and try again." });
      void trackEvent(updating ? "anonymous_update_error" : "anonymous_publish_error", { status: "network" });
    }
  }

  const buttonLabel = !published ? "Publish" : changedSincePublish ? "Update the link" : "Published";

  return (
    <div className="md-converter">
      <div className="md-paste">
        <div className="md-paste__head">
          <label htmlFor={textareaId} className="md-paste__label">
            Your Markdown
          </label>
          <div className="md-paste__meta">
            {text !== sample ? (
              <button type="button" className="md-paste__link" onClick={() => setText(sample)} disabled={busy}>
                Use the sample
              </button>
            ) : null}
            <span className={`md-paste__count ${tooLarge ? "md-paste__count--over" : ""}`}>
              {formatBytes(bytes, 1000)} of 512 KB
            </span>
          </div>
        </div>
        <textarea
          id={textareaId}
          className="md-paste__textarea md-paste__textarea--tall"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            if (status.kind === "error") setStatus({ kind: "idle" });
          }}
          placeholder={"# Title\n\nWrite or paste Markdown here."}
          spellCheck={false}
          disabled={busy}
        />
        <div className="md-paste__actions">
          <p className="md-paste__note">Anyone with the link can read it for 24 hours. No account needed.</p>
          <button
            type="button"
            onClick={publish}
            disabled={busy || (published !== null && !changedSincePublish)}
            className={`md-converter__cta md-paste__cta ${busy ? "md-converter__cta--busy" : ""} ${
              published && !changedSincePublish && !busy ? "md-paste__cta--done" : ""
            }`}
          >
            {busy ? (
              <>
                <Loader2 aria-hidden="true" className="md-converter__spinner" />
                {published ? "Updating…" : "Publishing…"}
              </>
            ) : (
              <>
                {published && !changedSincePublish ? <Check aria-hidden="true" className="h-4 w-4" /> : null}
                {buttonLabel}
              </>
            )}
          </button>
        </div>
        <HoneypotField inputRef={honeypotRef} />
      </div>

      {status.kind === "error" ? (
        <p className="md-converter__error" role="alert">
          {status.message}
        </p>
      ) : null}

      <div ref={resultRef}>
      {published ? (
        <PublishedLink
          published={published}
          markdown={publishedText ?? text}
          signedIn={signedIn}
          botFields={botFields}
          onStartOver={() => {
            setPublished(null);
            setPublishedText(null);
            setStatus({ kind: "idle" });
          }}
        />
      ) : null}
      </div>
    </div>
  );
}

function expiryLabel(expiresAt: string) {
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return "in 24 hours";
  const hours = Math.max(0, Math.round((date.getTime() - Date.now()) / 3_600_000));
  const when = date.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  return `in ${hours} hour${hours === 1 ? "" : "s"} (${when})`;
}

function PublishedLink({
  published,
  markdown,
  signedIn,
  botFields,
  onStartOver,
}: {
  published: Published;
  markdown: string;
  signedIn: boolean;
  /** The tool's bot-check fields: timed from when the tool appeared, not the result. */
  botFields: () => Record<string, string | number>;
  onStartOver: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [pdf, setPdf] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string }>({
    kind: "idle",
  });

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(published.url);
      setCopied(true);
      void trackEvent("anonymous_copy_link");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function downloadPdf() {
    if (pdf.kind === "busy") return;
    setPdf({ kind: "busy" });
    void trackEvent("convert_markdown_start", { format: "pdf", tool: "publish-markdown-online", input: "text" });
    try {
      const result = await convertMarkdown({
        format: "pdf",
        tool: "publish-markdown-online",
        text: markdown,
        filename: filenameFromMarkdown(markdown, "document"),
        botFields: botFields(),
      });
      downloadBlob(result.blob, result.filename);
      setPdf({ kind: "idle" });
      void trackEvent("convert_markdown_success", { format: "pdf", tool: "publish-markdown-online", input: "text" });
    } catch (err) {
      setPdf({
        kind: "error",
        message: err instanceof FreeToolError ? err.message : "Something went wrong making the PDF.",
      });
      void trackEvent("convert_markdown_error", {
        format: "pdf",
        tool: "publish-markdown-online",
        input: "text",
        status: err instanceof FreeToolError ? err.status : "unknown",
      });
    }
  }

  return (
    <section className="md-result" aria-live="polite" aria-label="Your link">
      <p className="md-result__title">
        <Check aria-hidden="true" /> Your link is ready
      </p>
      <div className="md-result__link-row">
        <a href={published.url} target="_blank" rel="noopener" className="md-result__url">
          {published.url.replace(/^https?:\/\//, "")}
        </a>
        <button type="button" className="md-result__icon-btn" onClick={copyLink} aria-label="Copy link">
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
        <a
          href={published.url}
          target="_blank"
          rel="noopener"
          className="md-result__icon-btn"
          aria-label="Open the link in a new tab"
        >
          <ExternalLink aria-hidden="true" />
          <span>Open</span>
        </a>
      </div>
      <p className="md-result__expiry">
        It expires {expiryLabel(published.expiresAt)}, then it&apos;s deleted. Edit the text above and update the
        link as often as you like.
      </p>
      <div className="md-result__actions">
        <a
          href={published.claimUrl}
          className="md-next__primary"
          onClick={() => void trackEvent("anonymous_keep_click", { signedIn })}
        >
          {signedIn ? "Keep it in your workspace" : "Keep it: sign up free"}
        </a>
        <button type="button" className="md-next__secondary" onClick={downloadPdf} disabled={pdf.kind === "busy"}>
          {pdf.kind === "busy" ? (
            <Loader2 aria-hidden="true" className="md-converter__spinner" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Download PDF
        </button>
      </div>
      {pdf.kind === "error" ? (
        <p className="md-converter__error md-result__error" role="alert">
          {pdf.message}
        </p>
      ) : null}
      <p className="md-result__fine">
        Keeping it moves the page into your workspace, private to your team until you share it.{" "}
        <button type="button" className="md-paste__link" onClick={onStartOver}>
          Start a new link
        </button>
      </p>
    </section>
  );
}
