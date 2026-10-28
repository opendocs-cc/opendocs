"use client";

import { useState } from "react";

export function CopyButton({
  text,
  className,
  label = "Copy",
  copiedLabel = "Copied",
  srLabel,
}: {
  text: string;
  className?: string;
  label?: string;
  copiedLabel?: string;
  /** What's copied, for screen readers when a page has many Copy buttons. */
  srLabel?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers / restricted contexts
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button type="button" className={className} onClick={handleCopy} aria-live="polite">
      {copied ? copiedLabel : label}
      {srLabel ? <span className="sr-only"> {srLabel}</span> : null}
    </button>
  );
}
