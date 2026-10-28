"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { AGENT_SETUP_PROMPT } from "@/lib/agent-prompt";
import { trackAdLead } from "@/lib/ad-tracking/client";
import { trackEvent } from "@/lib/analytics";

export { AGENT_SETUP_PROMPT };

/**
 * Copies the agent setup prompt (see lib/agent-prompt.ts). Pass `prompt`
 * for a personalized version; `source` tags the analytics event.
 */
export function CopyAgentPrompt({
  className,
  label = "Copy prompt for agent",
  prompt = AGENT_SETUP_PROMPT,
  source,
}: {
  className?: string;
  label?: string;
  prompt?: string;
  source?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      trackEvent("Copy agent prompt", source ? { source } : undefined);
      trackAdLead("copy_agent_prompt");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      aria-live="polite"
      title="Copy a setup prompt to paste into your AI agent"
    >
      {copied ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
      <span>{copied ? "Copied" : label}</span>
    </button>
  );
}
