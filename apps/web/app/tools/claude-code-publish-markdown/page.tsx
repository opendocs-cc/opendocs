import Link from "next/link";

import { MarketingCliBlock } from "@/components/marketing-cli-block";
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { AgentLogoStrip } from "@/components/marketing/agent-logo-strip";

export const metadata = buildPageMetadata({
  title: "Publish Markdown from Claude Code",
  description:
    "Have Claude Code publish Markdown docs straight to a shareable URL. One-command publishing via the OpenDocs CLI, built for AI agent workflows.",
  url: "https://opendocs.cc/tools/claude-code-publish-markdown",
  socialTitle: "Publish Markdown from Claude Code | OpenDocs",
});

export default async function ClaudeCodePublishMarkdownPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Claude Code</span>
        <h1 className="mk-hero__title">
          Publish Markdown from Claude Code
        </h1>
        <p className="mk-hero__subtitle">
          Claude writes great Markdown. Sharing it shouldn't be the
          hard part. Point Claude Code at the OpenDocs CLI and every
          plan, audit, or spec ends with a real URL.
        </p>
      </section>

      <AgentLogoStrip />

      <section className="mk-section">
        <div className="mk-section__body">
          <p>
            Claude Code is excellent at producing Markdown. PRDs,
            postmortems, migration plans, code reviews. It writes the
            doc, you read it in your terminal, and then it just sits
            there as a file in your repo.
          </p>
          <p>
            With OpenDocs in the loop, Claude can finish the job.
            Tell it to publish the doc when it's done; it runs the
            CLI and hands you back a URL you can drop into Slack or
            send to your team.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">How to set it up</h2>
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.65,
            color: "#3f3f46",
            margin: "0 0 1rem",
          }}
        >
          Install the CLI once. After that, anything Claude Code runs
          in the terminal can publish.
        </p>
        <MarketingCliBlock format="url" agentMode />
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#52525b",
            margin: "1rem 0 0",
          }}
        >
          Then add a line to your <code>CLAUDE.md</code>: something
          like <em>"After completing any plan or audit, publish it
          with <code>opendocs publish &lt;file&gt; --json</code> and
          return the URL."</em> Claude will start handing you links
          instead of files.
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">What Claude Code can publish</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Plans.</strong> Claude's project plans live in
              .md files. Publish them so the team can read them
              without cloning your repo.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Audits.</strong> Security reviews, codebase
              audits, dependency scans. Publish to a workspace-only
              link your team can read.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>PRDs and specs.</strong> When Claude drafts a
              PRD, drop the URL into Linear or Slack instead of
              copy-pasting the body.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Migration guides and runbooks.</strong> Turn
              the Markdown handover doc into a URL anyone on-call can
              bookmark.
            </p>
          </li>
        </ul>
      </section>

      <section className="mk-section">
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.65,
            color: "#3f3f46",
            margin: 0,
          }}
        >
          Want a fuller writeup of the integration?{" "}
          <Link
            href="/integrations/claude-code"
            style={{ color: "#6941c6", fontWeight: 600 }}
          >
            See the Claude Code integration page
          </Link>
          .
        </p>
      </section>

      <MarketingCta title={"Let Claude do the publishing too."} text={"Sign up, install the CLI, point Claude at it."} />
    </MarketingShell>
  );
}
