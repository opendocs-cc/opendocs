import Link from "next/link";

import { MarketingCliBlock } from "@/components/marketing-cli-block";
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { AgentLogoStrip } from "@/components/marketing/agent-logo-strip";
import { ExamplePages } from "@/components/marketing/example-pages";

export const metadata = buildPageMetadata({
  title: "AI Agent Markdown to PDF: One CLI Command",
  description:
    "Let your AI agent generate Markdown and ship it as a PDF in one command. Built for Claude Code, Cursor, Codex, and any agent that runs shell commands.",
  url: "https://opendocs.cc/tools/ai-agent-markdown-to-pdf",
  socialTitle: "AI Agent Markdown to PDF | OpenDocs",
});

export default async function AiAgentMarkdownToPdfPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">For AI agents</span>
        <h1 className="mk-hero__title">AI agent Markdown to PDF</h1>
        <p className="mk-hero__subtitle">
          Your agent writes a report in Markdown. The user wants it as
          a PDF. One CLI command bridges the two. No Python script
          calling Pandoc, no LaTeX install, no headless Chrome dance.
        </p>
      </section>

      <AgentLogoStrip />
      <ExamplePages />

      <section className="mk-section">
        <div className="mk-section__body">
          <p>
            Most agents are great at <em>writing</em> Markdown. It
            matches their training distribution and lets them think in
            structured prose. They're worse at <em>delivering</em>{" "}
            anything other than Markdown. The user asked for a PDF
            audit report and got a <code>.md</code> file dropped into
            their repo.
          </p>
          <p>
            OpenDocs gives the agent a one-line shortcut. Run{" "}
            <code>opendocs publish report.md --export pdf --json</code>
            {" "}
            and the response is a JSON payload with a hosted URL, a
            PDF download URL, and metadata. The agent prints the URL,
            the user clicks, the PDF lands in their downloads folder.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">The agent workflow</h2>
        <MarketingCliBlock format="pdf" agentMode />
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#52525b",
            margin: "1rem 0 0",
          }}
        >
          With <code>--json</code>, the response is machine-parseable.
          The agent grabs <code>data.exportUrls.pdf</code> and returns
          it. No extra dependencies, no document-conversion libraries
          to install.
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Why agents prefer this over Pandoc</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>No system dependencies.</strong> Pandoc needs
              LaTeX for PDF; that's a multi-GB install the agent
              probably doesn't have permission to run. The OpenDocs
              CLI is a node binary. Install once, use forever.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Output is a URL, not a file.</strong> Files
              don't show up nicely in chat. URLs do. The agent's
              response becomes{" "}
              <em>"Here's your audit: [link]"</em> instead of{" "}
              <em>"I saved the PDF to ./output/report.pdf"</em>.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>JSON-first.</strong>{" "}
              <code>--json</code> means the agent can chain the result
              into the next step (post to Slack, attach to a Linear
              issue) without parsing CLI output.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Re-runs are idempotent.</strong> Publish the
              same file twice and the URL stays the same. Useful for
              loops where the agent updates the doc on every code
              review.
            </p>
          </li>
        </ul>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Works with</h2>
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.65,
            color: "#3f3f46",
            margin: "0 0 1rem",
          }}
        >
          Anything that runs shell commands. We have specific guides
          for the common ones:
        </p>
        <div className="mk-grid">
          <Link href="/integrations/claude-code" className="mk-card">
            <h3 className="mk-card__title">Claude Code</h3>
            <p className="mk-card__desc">
              Use OpenDocs as a CLAUDE.md skill so Claude publishes
              reports automatically.
            </p>
          </Link>
          <Link href="/integrations/cursor" className="mk-card">
            <h3 className="mk-card__title">Cursor</h3>
            <p className="mk-card__desc">
              Add an OpenDocs rule in <code>.cursor/rules</code> so
              the agent hands you URLs instead of files.
            </p>
          </Link>
          <Link href="/integrations/codex" className="mk-card">
            <h3 className="mk-card__title">Codex</h3>
            <p className="mk-card__desc">
              The CLI is shell-callable, so Codex can publish
              Markdown outputs as part of any task.
            </p>
          </Link>
          <Link href="/integrations/openclaw" className="mk-card">
            <h3 className="mk-card__title">OpenClaw</h3>
            <p className="mk-card__desc">
              Add the OpenDocs SKILL.md as an OpenClaw workspace
              skill.
            </p>
          </Link>
        </div>
      </section>

      <MarketingCta title={"Stop having your agent dump files into your repo."} text={"Free plan publishes up to 50 docs with PDF export included."} />
    </MarketingShell>
  );
}
