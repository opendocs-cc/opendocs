import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { AddToChatGptButton } from "@/components/add-to-chatgpt-button";
import { AddToClaudeButton } from "@/components/add-to-claude-button";
import { CopyAgentPrompt } from "@/components/copy-agent-prompt";
import { agentSetupPrompt } from "@/lib/agent-prompt";
import { AGENT_LOGOS } from "@/lib/agent-logos";
import { MCP_PAGE_PATH } from "@/lib/mcp";

const APP_BUTTON =
  "inline-flex items-center gap-2 rounded-lg border border-[#d4d4d4] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#171717] shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors hover:bg-[#fafafa] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7F56D9]/25";

/**
 * "Connect your agent" on the dashboard home: the setup prompt with the
 * person's email and active workspace filled in, so their agent signs them
 * in instead of signing up. Shown to everyone; people with a connected
 * agent get copy about adding another one. A row at the bottom points
 * people who use the Claude or ChatGPT app to the MCP server instead.
 */
export function ConnectAgentCard({
  className = "",
  email,
  workspaceName,
  workspaceSlug,
  hasConnectedAgent,
}: {
  className?: string;
  email: string;
  workspaceName?: string;
  workspaceSlug?: string;
  hasConnectedAgent: boolean;
}) {
  const prompt = agentSetupPrompt({ email, workspaceName, workspaceSlug });

  return (
    <section
      aria-labelledby="connect-agent-title"
      className={`overflow-hidden rounded-xl border border-[#E9D7FE] bg-[linear-gradient(135deg,#F9F5FF_0%,#FFFFFF_60%)] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] ${className}`}
    >
      <div className="grid grid-cols-1 gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:items-center lg:gap-8">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6941C6]">
            {hasConnectedAgent ? "Connect an agent" : "Connect your agent"}
          </div>
          <h2
            id="connect-agent-title"
            className="mt-1.5 text-[18px] font-semibold leading-tight text-[#171717]"
          >
            {hasConnectedAgent
              ? "Add OpenDocs to another agent"
              : "Publish straight from Claude Code, Codex or Cursor"}
          </h2>
          <p className="mt-2 max-w-[46ch] text-[14px] leading-[22px] text-[#525252]">
            Copy this prompt into your agent. It installs OpenDocs, signs you in as{" "}
            <span className="font-medium text-[#171717]">{email}</span> and asks what to
            publish. It takes about a minute.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <CopyAgentPrompt
              prompt={prompt}
              source="dashboard"
              label="Copy prompt"
              className="inline-flex items-center gap-2 rounded-lg bg-[#7F56D9] px-4 py-2.5 text-[14px] font-semibold text-white shadow-[0px_1px_2px_0px_rgba(16,24,40,0.05)] transition-colors hover:bg-[#6941C6] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#7F56D9]/25 active:scale-[0.98]"
            />
            <a
              href="https://docs.opendocs.cc/getting-started/agent-quickstart"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#6941C6] hover:text-[#53389E]"
            >
              Setup guide
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </a>
          </div>
          <ul
            className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 text-[#A3A3A3]"
            aria-label="Works with"
          >
            {AGENT_LOGOS.map((logo) => (
              <li key={logo.slug}>
                <svg role="img" viewBox="0 0 24 24" className="h-[18px] w-[18px] fill-current">
                  <title>{logo.title}</title>
                  <path d={logo.path} />
                </svg>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative min-w-0" aria-hidden="true">
          <pre className="max-h-[208px] overflow-hidden whitespace-pre-wrap break-words rounded-lg border border-[#e5e5e5] bg-white px-4 py-3.5 font-mono text-[12px] leading-[19px] text-[#404040]">
            {prompt}
          </pre>
          <div className="pointer-events-none absolute inset-x-px bottom-px h-16 rounded-b-lg bg-gradient-to-t from-white to-white/0" />
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-[#E9D7FE] bg-white/70 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-[14px] leading-[20px] text-[#525252]">
          <span className="font-semibold text-[#171717]">Using the Claude or ChatGPT app?</span> Connect
          OpenDocs over MCP. Nothing to install.
        </p>
        <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2">
          <AddToClaudeButton iconClassName="h-4 w-4" className={APP_BUTTON} />
          <AddToChatGptButton iconClassName="h-3.5 w-3.5" className={APP_BUTTON} />
          <Link
            href={MCP_PAGE_PATH}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#6941C6] hover:text-[#53389E]"
          >
            Other apps
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
