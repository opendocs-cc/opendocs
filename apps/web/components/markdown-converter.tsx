"use client";

import Link from "next/link";
import { useId, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CloudUpload, Download, FileText, Loader2, X } from "lucide-react";

import type { FreeToolSlug } from "@opendocs/shared/config/free-tools";
import { HoneypotField } from "@/components/free-tools/honeypot-field";
import { trackEvent } from "@/lib/analytics";
import {
  ANONYMOUS_MAX_BYTES,
  CONVERTER_MAX_BYTES,
  FreeToolError,
  byteLength,
  convertMarkdown,
  downloadBlob,
  filenameFromMarkdown,
  formatBytes,
  saveDraftForPublish,
  useBotCheck,
  type ConvertFormat,
} from "@/lib/free-tools/client";

/**
 * The free converter used by every /tools page. Two inputs:
 *
 *   - `input="file"` (default): drop zone for a .md file
 *     (/tools/markdown-to-pdf, -word, -docx).
 *   - `input="text"`: a text box for pasted Markdown (AI answers, READMEs,
 *     tables). The text goes up as a .md file, so it gets the same 2 MB limit
 *     and server checks as an upload.
 *
 * Pass `formats` to let people pick PDF or Word; `tool` tags analytics and
 * the footer link in the file. In text mode the text can be controlled
 * (`text` + `onTextChange`) so a page can fill it, as the README tool does.
 *
 * Conversion only starts on an explicit click, so nobody burns their rate
 * limit by picking a file. The state machine:
 *   - "idle"        nothing picked (file mode) or not converted yet (text mode)
 *   - "selected"    file picked, waiting for the click
 *   - "converting"  request in flight
 *   - "done"        downloaded; offers the next step
 *   - "error"       message shown in place; the input is kept for a retry
 */
type ConverterState =
  | { kind: "idle" }
  | { kind: "selected"; file: File }
  | { kind: "converting"; file: File | null }
  | { kind: "done"; file: File | null; downloadName: string; format: ConvertFormat }
  | { kind: "error"; file: File | null; message: string };

type MarkdownConverterProps = {
  /**
   * The output when there's one. Keep these strings stable: analytics events
   * carry `format` directly, so renaming would split the Plausible breakdown.
   */
  format?: ConvertFormat;
  /** Offer a choice; the first one is selected to start with. */
  formats?: ConvertFormat[];
  /** Which tool page this is, for analytics and the export's footer link. */
  tool: FreeToolSlug;
  input?: "file" | "text";
  /** Text mode: starting text when uncontrolled. */
  defaultText?: string;
  /** Text mode: controlled text. */
  text?: string;
  onTextChange?: (text: string) => void;
  textLabel?: string;
  placeholder?: string;
  /** Text mode: fills the box with an example. */
  sample?: string;
  /** File name (without extension) when the text has no heading. */
  fallbackFilename?: string;
  /** Text mode: a hint about the current text, e.g. "no table found". */
  hint?: (text: string) => string | null;
  /** Rendered above the text box (e.g. the README tool's GitHub field). */
  toolbar?: ReactNode;
};

const FORMAT_COPY: Record<ConvertFormat, { ctaLabel: string; doneLabel: string; short: string }> = {
  pdf: { ctaLabel: "Convert to PDF", doneLabel: "PDF downloaded", short: "PDF" },
  docx: { ctaLabel: "Convert to Word", doneLabel: "Word document downloaded", short: "Word" },
};

export function MarkdownConverter({
  format,
  formats,
  tool,
  input = "file",
  defaultText = "",
  text: controlledText,
  onTextChange,
  textLabel = "Paste your Markdown",
  placeholder = "Paste Markdown here",
  sample,
  fallbackFilename = "document",
  hint,
  toolbar,
}: MarkdownConverterProps) {
  const choices = formats?.length ? formats : [format ?? "pdf"];
  const [selectedFormat, setSelectedFormat] = useState<ConvertFormat>(choices[0]);
  const [state, setState] = useState<ConverterState>({ kind: "idle" });
  const [isDragging, setIsDragging] = useState(false);
  const [ownText, setOwnText] = useState(defaultText);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();
  const { honeypotRef, botFields } = useBotCheck();

  const text = controlledText ?? ownText;
  const setText = (next: string) => {
    if (onTextChange) onTextChange(next);
    if (controlledText === undefined) setOwnText(next);
  };

  const copy = FORMAT_COPY[selectedFormat];
  const textBytes = input === "text" ? byteLength(text) : 0;
  const textTooLarge = textBytes > CONVERTER_MAX_BYTES;

  function pickFile() {
    fileInputRef.current?.click();
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!/\.(md|markdown)$/i.test(file.name)) {
      setState({ kind: "error", file: null, message: "Only .md or .markdown files are supported." });
      return;
    }
    if (file.size > CONVERTER_MAX_BYTES) {
      setState({ kind: "error", file: null, message: "Files must be under 2 MB." });
      return;
    }
    if (file.size === 0) {
      setState({ kind: "error", file: null, message: "That file is empty." });
      return;
    }
    setState({ kind: "selected", file });
  }

  async function convert() {
    if (state.kind === "converting") return;
    const file = input === "file" && (state.kind === "selected" || state.kind === "error") ? state.file : null;
    if (input === "file" && !file) return;
    if (input === "text") {
      if (!text.trim()) {
        setState({ kind: "error", file: null, message: "Paste some Markdown first." });
        return;
      }
      if (textTooLarge) {
        setState({ kind: "error", file: null, message: "That's more than 2 MB of text. Split it into smaller parts." });
        return;
      }
    }

    const outputFormat = selectedFormat;
    setState({ kind: "converting", file });
    void trackEvent("convert_markdown_start", { format: outputFormat, tool, input });

    try {
      const result = await convertMarkdown({
        format: outputFormat,
        tool,
        file: file ?? undefined,
        text: input === "text" ? text : undefined,
        filename: filenameFromMarkdown(text, fallbackFilename),
        botFields: botFields(),
      });
      downloadBlob(result.blob, result.filename);
      setState({ kind: "done", file, downloadName: result.filename, format: outputFormat });
      void trackEvent("convert_markdown_success", { format: outputFormat, tool, input });
    } catch (err) {
      const message = err instanceof FreeToolError ? err.message : "Something went wrong converting your Markdown.";
      setState({ kind: "error", file, message });
      void trackEvent("convert_markdown_error", {
        format: outputFormat,
        tool,
        input,
        status: err instanceof FreeToolError ? err.status : "unknown",
      });
    }
  }

  function reset() {
    setState({ kind: "idle" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const isBusy = state.kind === "converting";

  const formatToggle =
    choices.length > 1 ? (
      <div className="md-format-toggle" role="radiogroup" aria-label="Output format">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={selectedFormat === choice}
            className="md-format-toggle__option"
            onClick={() => {
              setSelectedFormat(choice);
              if (state.kind === "done") setState({ kind: "idle" });
            }}
            disabled={isBusy}
          >
            {FORMAT_COPY[choice].short}
          </button>
        ))}
      </div>
    ) : null;

  const convertButton = (
    <button
      type="button"
      onClick={convert}
      disabled={isBusy}
      className={`md-converter__cta ${isBusy ? "md-converter__cta--busy" : ""}`}
    >
      {isBusy ? (
        <>
          <Loader2 aria-hidden="true" className="md-converter__spinner" />
          Converting…
        </>
      ) : state.kind === "error" && input === "file" ? (
        "Try again"
      ) : (
        copy.ctaLabel
      )}
    </button>
  );

  const doneBlock =
    state.kind === "done" ? (
      <ConvertedNextSteps
        doneLabel={FORMAT_COPY[state.format].doneLabel}
        tool={tool}
        getMarkdown={async () => (input === "text" ? text : ((await state.file?.text()) ?? ""))}
        onConvertAnother={input === "file" ? reset : undefined}
      />
    ) : null;

  const errorBlock =
    state.kind === "error" ? (
      <p className="md-converter__error" role="alert">
        {state.message}
      </p>
    ) : null;

  if (input === "text") {
    const hintText = hint?.(text) ?? null;
    return (
      <div className="md-converter">
        <div className="md-paste">
          {toolbar}
          <div className="md-paste__head">
            <label htmlFor={textareaId} className="md-paste__label">
              {textLabel}
            </label>
            <div className="md-paste__meta">
              {sample && text !== sample ? (
                <button
                  type="button"
                  className="md-paste__link"
                  onClick={() => {
                    setText(sample);
                    if (state.kind !== "converting") setState({ kind: "idle" });
                  }}
                >
                  {text.trim() ? "Use the sample" : "Try a sample"}
                </button>
              ) : null}
              <span className={`md-paste__count ${textTooLarge ? "md-paste__count--over" : ""}`}>
                {formatBytes(textBytes)} of 2 MB
              </span>
            </div>
          </div>
          <textarea
            id={textareaId}
            className="md-paste__textarea"
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              if (state.kind === "done" || state.kind === "error") setState({ kind: "idle" });
            }}
            placeholder={placeholder}
            spellCheck={false}
            disabled={isBusy}
          />
          {hintText ? <p className="md-paste__hint">{hintText}</p> : null}
          <div className="md-paste__actions">
            {formatToggle}
            {convertButton}
          </div>
          <HoneypotField inputRef={honeypotRef} />
        </div>
        {errorBlock}
        {doneBlock}
      </div>
    );
  }

  const showFile =
    state.kind === "selected" ||
    (state.kind === "converting" && state.file) ||
    (state.kind === "done" && state.file) ||
    (state.kind === "error" && state.file);
  const currentFile = "file" in state ? state.file : null;

  return (
    <div className="md-converter">
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,text/markdown,text/plain"
        className="md-converter__input"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <HoneypotField inputRef={honeypotRef} />

      <div
        // A button only while it's the drop zone; once a file is picked it
        // holds buttons of its own.
        role={showFile ? undefined : "button"}
        tabIndex={showFile ? undefined : 0}
        aria-label={showFile ? undefined : "Choose a Markdown file"}
        onClick={() => !isBusy && !showFile && pickFile()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !isBusy && !showFile) {
            e.preventDefault();
            pickFile();
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (isBusy) return;
          handleFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!isBusy && !showFile) setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        className={`md-converter__zone ${isDragging ? "md-converter__zone--dragging" : ""} ${
          showFile ? "md-converter__zone--has-file" : ""
        }`}
      >
        {!showFile && (
          <div className="md-converter__empty">
            <div className="md-converter__icon">
              <CloudUpload aria-hidden="true" />
            </div>
            <p className="md-converter__title">
              <span className="md-converter__title-action">Click to upload</span> or drag and drop
            </p>
            <p className="md-converter__hint">Markdown file (.md), up to 2 MB</p>
          </div>
        )}

        {showFile && currentFile && (
          <div className="md-converter__file">
            <div className="md-converter__file-row">
              <FileText aria-hidden="true" className="md-converter__file-icon" />
              <div className="md-converter__file-meta">
                <p className="md-converter__file-name">{currentFile.name}</p>
                <p className="md-converter__file-size">{(currentFile.size / 1024).toFixed(1)} KB</p>
              </div>
              {!isBusy && (
                <button type="button" onClick={reset} className="md-converter__remove" aria-label="Remove file">
                  <X aria-hidden="true" />
                </button>
              )}
            </div>
            {formatToggle}
            {state.kind !== "done" && convertButton}
            {doneBlock}
          </div>
        )}
      </div>

      {errorBlock}
    </div>
  );
}

/**
 * After a download: the file carries the "Made with OpenDocs" footer, so
 * offer the next step: the same Markdown as a link, or an account.
 */
function ConvertedNextSteps({
  doneLabel,
  tool,
  getMarkdown,
  onConvertAnother,
}: {
  doneLabel: string;
  tool: FreeToolSlug;
  getMarkdown: () => Promise<string>;
  onConvertAnother?: () => void;
}) {
  const [tooLarge, setTooLarge] = useState(false);

  async function publishAsLink(event: React.MouseEvent<HTMLAnchorElement>) {
    void trackEvent("convert_next_publish", { tool });
    const markdown = await getMarkdown().catch(() => "");
    if (byteLength(markdown) > ANONYMOUS_MAX_BYTES) {
      // Too big for an anonymous link; signing up publishes it instead.
      event.preventDefault();
      setTooLarge(true);
      return;
    }
    saveDraftForPublish(markdown);
  }

  return (
    <div className="md-converter__done" role="status">
      <p className="md-converter__done-msg">
        <Download aria-hidden="true" /> {doneLabel}
      </p>
      <div className="md-next">
        <p className="md-next__text">
          It ends with a small &ldquo;Made with OpenDocs&rdquo; footer. Want it as a link people can open instead?
        </p>
        <div className="md-next__actions">
          <Link href="/tools/publish-markdown-online" className="md-next__primary" onClick={publishAsLink}>
            Publish it as a link
            <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            href="/signup"
            className="md-next__secondary"
            onClick={() => void trackEvent("convert_next_signup", { tool })}
          >
            Sign up free
          </Link>
        </div>
        {tooLarge ? (
          <p className="md-next__note">
            Anonymous links take up to 512 KB of Markdown. Sign up free to publish bigger documents.
          </p>
        ) : null}
      </div>
      {onConvertAnother ? (
        <button
          type="button"
          onClick={onConvertAnother}
          className="md-converter__cta md-converter__cta--secondary"
        >
          Convert another file
        </button>
      ) : null}
    </div>
  );
}
