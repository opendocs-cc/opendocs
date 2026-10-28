"use client";

import { useId, useState } from "react";
import { Loader2 } from "lucide-react";

import { MarkdownConverter } from "@/components/markdown-converter";
import { trackEvent } from "@/lib/analytics";
import { CONVERTER_MAX_BYTES } from "@/lib/free-tools/client";
import { ReadmeFetchError, fetchGithubReadme, parseGithubLocation } from "@/lib/free-tools/github-readme";

/**
 * README to PDF / Word: a GitHub field that fills the converter's text box
 * from the repository (fetched by the browser, never by our API), or paste
 * the README directly.
 */
export function ReadmeConverter({ sample }: { sample: string }) {
  const [text, setText] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [fetchState, setFetchState] = useState<
    { kind: "idle" } | { kind: "busy" } | { kind: "done"; label: string } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const inputId = useId();

  async function fetchReadme(event: React.FormEvent) {
    event.preventDefault();
    if (fetchState.kind === "busy") return;
    const location = parseGithubLocation(repoInput);
    if (!location) {
      setFetchState({
        kind: "error",
        message: "Enter a GitHub repository like github.com/owner/repo, or a link to a .md file on GitHub.",
      });
      return;
    }
    setFetchState({ kind: "busy" });
    try {
      const readme = await fetchGithubReadme(location, CONVERTER_MAX_BYTES);
      setText(readme.markdown);
      setFetchState({ kind: "done", label: readme.label });
      void trackEvent("readme_fetch_success", { kind: location.kind });
    } catch (err) {
      setFetchState({
        kind: "error",
        message: err instanceof ReadmeFetchError ? err.message : "Something went wrong fetching the README.",
      });
      void trackEvent("readme_fetch_error", { kind: location.kind });
    }
  }

  const toolbar = (
    <form className="md-gh" onSubmit={fetchReadme} noValidate>
      <label htmlFor={inputId} className="md-paste__label">
        GitHub repository
      </label>
      <div className="md-gh__row">
        <input
          id={inputId}
          className="md-gh__input"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="github.com/owner/repo"
          value={repoInput}
          onChange={(event) => {
            setRepoInput(event.target.value);
            if (fetchState.kind === "error") setFetchState({ kind: "idle" });
          }}
        />
        <button type="submit" className="md-gh__button" disabled={fetchState.kind === "busy"}>
          {fetchState.kind === "busy" ? <Loader2 aria-hidden="true" className="md-converter__spinner" /> : null}
          Fetch README
        </button>
      </div>
      {fetchState.kind === "done" ? (
        <p className="md-gh__status" role="status">
          Fetched {fetchState.label}. Edit it below if you like, then convert.
        </p>
      ) : fetchState.kind === "error" ? (
        <p className="md-gh__status md-gh__status--error" role="alert">
          {fetchState.message}
        </p>
      ) : (
        <p className="md-gh__status">Public repositories only. Your browser fetches it straight from GitHub.</p>
      )}
      <p className="md-gh__or" aria-hidden="true">
        <span>or paste it</span>
      </p>
    </form>
  );

  return (
    <MarkdownConverter
      input="text"
      formats={["pdf", "docx"]}
      tool="readme-to-pdf"
      text={text}
      onTextChange={setText}
      textLabel="README"
      placeholder={"# Project name\n\nPaste your README here."}
      sample={sample}
      fallbackFilename="readme"
      toolbar={toolbar}
    />
  );
}
