import Link from "next/link";

import { MarketingCliBlock } from "@/components/marketing-cli-block";
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { AgentLogoStrip } from "@/components/marketing/agent-logo-strip";

export const metadata = buildPageMetadata({
  title: "Publish Markdown from AI Coding Agents",
  description:
    "Claude Code, Cursor, Codex, and other agents write a lot of Markdown. OpenDocs is the publishing layer that turns it into shareable URLs in one command.",
  url: "https://opendocs.cc/use-cases/ai-agent-docs",
  socialTitle: "Publish Markdown from AI Coding Agents | OpenDocs",
});

export default async function AiAgentDocsPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Use case</span>
        <h1 className="mk-hero__title">
          Publish Markdown from AI coding agents
        </h1>
        <p className="mk-hero__subtitle">
          Your agent writes Markdown all day. PRDs, code reviews,
          audits, migration plans. OpenDocs is the missing publishing
          step that turns each one into a URL anyone can read.
        </p>
      </section>

      <AgentLogoStrip />

      <section className="mk-section">
        <h2 className="mk-section__title">The problem</h2>
        <div className="mk-section__body">
          <p>
            Modern coding agents are great at producing structured
            prose. Ask Claude Code for a refactor plan and you get
            back a beautifully-organised Markdown file. Ask Cursor
            for a security audit and the output is a clean
            checklist.
          </p>
          <p>
            Then the file just sits there. To share it you either
            commit it to the repo (audience needs git access), paste
            it into a wiki (lose the formatting), or export to PDF
            (now you have an attachment instead of a link).
          </p>
          <p>
            The agent did the work. It should also do the delivery.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">The agent demo</h2>
        <p
          style={{
            fontSize: "1rem",
            lineHeight: 1.65,
            color: "#3f3f46",
            margin: "0 0 1rem",
          }}
        >
          Tell the agent to publish when it's done. The conversation
          ends up looking like:
        </p>
        <pre className="mk-code">
          <code>
            <span className="mk-code__comment">
              # User: "Plan the auth migration. Publish the doc when done."
            </span>
            {"\n\n"}
            <span className="mk-code__comment">
              # Agent (after writing plan.md):
            </span>
            {"\n"}
            $ opendocs publish plan.md --json
            {"\n"}
            {"{"}{"\n"}
            {"  "}"url": "https://opendocs.cc/acme/auth-migration-plan",{"\n"}
            {"  "}"slug": "auth-migration-plan"{"\n"}
            {"}"}
            {"\n\n"}
            <span className="mk-code__comment">
              # Agent's final response to the user:
            </span>
            {"\n"}
            <span className="mk-code__comment">
              # "Plan published: https://opendocs.cc/acme/auth-migration-plan"
            </span>
          </code>
        </pre>
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#52525b",
            margin: "1rem 0 0",
          }}
        >
          The user gets a URL, not a filename. Click, read, done. No
          more <em>"where did the agent save that file again?"</em>
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">What agents publish</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>PRDs.</strong> Let the agent draft the product
              requirement, publish to a workspace link product can
              comment on.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Code reviews.</strong> Agents are good at
              first-pass review. Publish the writeup so the author
              can read it without opening their IDE.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Specs and ADRs.</strong> Keep them in the repo
              for version control, publish them to a URL the rest of
              the org can read.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Audits.</strong> Security review, dependency
              audit, performance baseline. The agent runs the audit
              and the URL goes to the security channel.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Migration plans.</strong> The agent surveys
              the codebase, drafts the plan, publishes it. Reviewers
              comment via the URL instead of cloning the branch.
            </p>
          </li>
        </ul>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Setup is one install</h2>
        <MarketingCliBlock format="url" agentMode />
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#52525b",
            margin: "1rem 0 0",
          }}
        >
          Want to teach the agent the workflow? Point it at our{" "}
          <a
            href="https://github.com/opendocs-cc/opendocs-cli/blob/main/agent/SKILL.md"
            style={{ color: "#6941c6", fontWeight: 600 }}
          >
            SKILL.md
          </a>
          . It's a Markdown file that documents the OpenDocs CLI in a
          shape agents can read.
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Per-agent guides</h2>
        <div className="mk-grid">
          <Link href="/integrations/claude-code" className="mk-card">
            <h3 className="mk-card__title">Claude Code</h3>
            <p className="mk-card__desc">
              Add a publish step to your <code>CLAUDE.md</code>.
            </p>
          </Link>
          <Link href="/integrations/cursor" className="mk-card">
            <h3 className="mk-card__title">Cursor</h3>
            <p className="mk-card__desc">
              Add an OpenDocs rule in <code>.cursor/rules</code>.
            </p>
          </Link>
          <Link href="/integrations/codex" className="mk-card">
            <h3 className="mk-card__title">Codex</h3>
            <p className="mk-card__desc">
              Shell-callable; works with any Codex task.
            </p>
          </Link>
          <Link href="/integrations/openclaw" className="mk-card">
            <h3 className="mk-card__title">OpenClaw</h3>
            <p className="mk-card__desc">
              Add the OpenDocs SKILL.md as a workspace skill.
            </p>
          </Link>
          <Link href="/integrations/hermes-agent" className="mk-card">
            <h3 className="mk-card__title">Hermes Agent</h3>
            <p className="mk-card__desc">
              Docs and runbooks published as part of the agent loop.
            </p>
          </Link>
          <Link href="/integrations/aider" className="mk-card">
            <h3 className="mk-card__title">Aider</h3>
            <p className="mk-card__desc">
              Aider writes a lot of Markdown. Publish at the end of
              each session.
            </p>
          </Link>
        </div>
      </section>

      <MarketingCta title={"Make publishing the agent's last step."} text={"No credit card."} />
    </MarketingShell>
  );
}
