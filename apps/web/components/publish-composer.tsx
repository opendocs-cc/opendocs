"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { startTransition, useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trackEvent } from "@/lib/analytics";
import { API_BASE_URL } from "@/lib/config/api";

type PublishComposerProps = {
  workspaceId: string;
};

export function PublishComposer({ workspaceId }: PublishComposerProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("# Hello OpenDocs\n\nThis is my first published document.");
  const [visibility, setVisibility] = useState<"workspace" | "public" | "private">("workspace");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handlePublish = () => {
    setIsPending(true);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/publish`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title,
            markdown,
            workspaceId,
            visibility,
            confirmPublic: visibility === "public",
            tags: [],
          }),
        });

        const payload = (await response.json()) as {
          url?: string;
          message?: string;
        };

        if (!response.ok || !payload.url) {
          throw new Error(payload.message ?? "Unable to publish.");
        }

        trackEvent("Document Published", { visibility });
        router.push(payload.url);
        router.refresh();
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  return (
    <section
      className="od-panel"
      style={{
        borderRadius: "var(--od-radius-md)",
        padding: "1.2rem",
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: "0.45rem" }}>Publish your first Markdown doc</h2>
      <p className="od-muted" style={{ marginTop: 0 }}>
        This uses the real publish API and stores the document in Postgres.
      </p>
      <div style={{ display: "grid", gap: "0.85rem" }}>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Weekly product memo"
          autoComplete="off"
          style={inputStyle}
        />
        <Select
          value={visibility}
          onValueChange={(v) =>
            setVisibility(v as "workspace" | "public" | "private")
          }
        >
          <SelectTrigger className="w-full rounded-[14px] border border-[var(--od-border)] bg-[rgba(255,255,255,0.9)] px-4 py-[0.9rem] text-[var(--od-text)] text-base focus:ring-2 focus:ring-[#7F56D9]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="workspace">Workspace</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="public">Public</SelectItem>
          </SelectContent>
        </Select>
        <textarea
          value={markdown}
          onChange={(event) => setMarkdown(event.target.value)}
          rows={12}
          style={{
            ...inputStyle,
            resize: "vertical",
            fontFamily:
              'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
          }}
        />
        <button
          type="button"
          disabled={isPending || !markdown}
          onClick={handlePublish}
          style={{
            border: "none",
            borderRadius: "999px",
            background: "var(--od-accent)",
            color: "#fff",
            padding: "0.95rem 1rem",
            fontWeight: 600,
            cursor: "pointer",
            opacity: isPending ? 0.7 : 1,
          }}
        >
          {isPending ? "Publishing..." : "Publish"}
        </button>
        {error ? (
          <p style={{ margin: 0, color: "var(--od-accent)" }}>{error}</p>
        ) : (
          <p className="od-soft" style={{ margin: 0 }}>
            Public publishing requires explicit confirmation and stays opt-in.
          </p>
        )}
      </div>
    </section>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  borderRadius: "14px",
  border: "1px solid var(--od-border)",
  background: "rgba(255,255,255,0.9)",
  padding: "0.9rem 1rem",
  color: "var(--od-text)",
};
