import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { FreeToolSlug } from "@opendocs/shared/config/free-tools";
import { CopyAgentPrompt } from "@/components/copy-agent-prompt";
import { MarketingCliBlock } from "@/components/marketing-cli-block";

/**
 * Sections shared by the free tool pages: "Do this from your agent" and the
 * links to the other tools.
 */

export function ToolAgentBlock({
  format,
  anonymous = false,
  source,
  children,
}: {
  format: "pdf" | "docx" | "url";
  anonymous?: boolean;
  source: FreeToolSlug;
  children: React.ReactNode;
}) {
  return (
    <section className="md-tool__section">
      <h2 className="md-tool__section-title">Do this from your agent</h2>
      <p className="md-tool__lead">{children}</p>
      <MarketingCliBlock format={format} agentMode anonymous={anonymous} />
      <div className="md-tool__agent-actions">
        <CopyAgentPrompt
          source={`tool:${source}`}
          className="inline-flex h-11 items-center gap-2.5 rounded-full bg-[#6B3FC9] px-5 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(107,63,201,0.7)] transition hover:bg-[#5B33B0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25"
        />
        <span className="md-tool__agent-note">
          Paste it into Claude Code, Cursor, Codex or any agent that runs commands. It installs the CLI and signs you
          up.
        </span>
      </div>
    </section>
  );
}

const TOOLS: Array<{ slug: FreeToolSlug; href: string; title: string; desc: string }> = [
  {
    slug: "publish-markdown-online",
    href: "/tools/publish-markdown-online",
    title: "Paste Markdown, get a link",
    desc: "A page anyone can open, no account needed.",
  },
  {
    slug: "chatgpt-to-pdf",
    href: "/tools/chatgpt-to-pdf",
    title: "ChatGPT to PDF",
    desc: "Turn an AI answer into a typeset PDF or Word file.",
  },
  {
    slug: "readme-to-pdf",
    href: "/tools/readme-to-pdf",
    title: "README to PDF",
    desc: "From a GitHub repository or pasted text.",
  },
  {
    slug: "markdown-table-to-word",
    href: "/tools/markdown-table-to-word",
    title: "Markdown table to Word",
    desc: "A real, editable Word table from a Markdown one.",
  },
  {
    slug: "markdown-to-pdf",
    href: "/tools/markdown-to-pdf",
    title: "Markdown to PDF",
    desc: "Drop in a .md file, get a clean PDF.",
  },
  {
    slug: "markdown-to-word",
    href: "/tools/markdown-to-word",
    title: "Markdown to Word",
    desc: "A .docx that opens in Word, Google Docs and Pages.",
  },
];

export function ToolCrossLinks({ current, limit = 3 }: { current: FreeToolSlug; limit?: number }) {
  // markdown-to-docx and markdown-to-word are the same tool under two names.
  const sameTool = current === "markdown-to-docx" ? "markdown-to-word" : current;
  const others = TOOLS.filter((tool) => tool.slug !== sameTool).slice(0, limit);
  return (
    <section className="md-tool__section">
      <h2 className="md-tool__section-title">More free tools</h2>
      <div className="md-tool__tools">
        {others.map((tool) => (
          <Link key={tool.slug} href={tool.href} className="md-tool__tool">
            <span className="md-tool__tool-title">
              {tool.title}
              <ArrowRight aria-hidden="true" />
            </span>
            <span className="md-tool__tool-desc">{tool.desc}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
