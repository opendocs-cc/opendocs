import Link from "next/link";

import { MarketingCliBlock } from "@/components/marketing-cli-block";
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { AgentLogoStrip } from "@/components/marketing/agent-logo-strip";

export const metadata = buildPageMetadata({
  title: "Publish Markdown from Cursor",
  description:
    "Have Cursor publish Markdown docs to a shareable URL. One-command publishing via the OpenDocs CLI, without leaving your editor.",
  url: "https://opendocs.cc/tools/cursor-publish-markdown",
  socialTitle: "Publish Markdown from Cursor | OpenDocs",
});

export default async function CursorPublishMarkdownPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Cursor</span>
        <h1 className="mk-hero__title">
          Publish Markdown from Cursor
        </h1>
        <p className="mk-hero__subtitle">
          The Markdown files you and Cursor write together (specs,
          ADRs, postmortems) become shareable URLs with one
          command. No leaving the editor.
        </p>
      </section>

      <AgentLogoStrip />

      <section className="mk-section">
        <div className="mk-section__body">
          <p>
            Cursor lives next to your code. So do most of your{" "}
            <code>.md</code> files: <code>README.md</code>,{" "}
            <code>ARCHITECTURE.md</code>, the <code>docs/</code>{" "}
            folder, ADRs in <code>decisions/</code>. Sharing them
            with someone outside the repo is the part that always
            breaks your flow.
          </p>
          <p>
            OpenDocs slots into that gap. Stay in Cursor, open the
            integrated terminal, run <code>opendocs publish</code>,
            paste the URL into Slack. That's the whole loop.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">The two-line setup</h2>
        <MarketingCliBlock format="url" />
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.6,
            color: "#52525b",
            margin: "1rem 0 0",
          }}
        >
          Add it to your Cursor rules so the agent knows to publish
          when you ask it to "share" a file. Sample rule:{" "}
          <em>
            "When the user asks to share a Markdown file, run{" "}
            <code>opendocs publish &lt;file&gt;</code> and return the
            URL."
          </em>
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Use cases inside Cursor</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>ADRs.</strong> Keep them in the repo for
              version control. Publish each one to a URL so the rest
              of the company can read it without needing git access.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Onboarding docs.</strong> The README in your
              <code>docs/</code> folder, but readable by recruiters
              and new hires before they ever join.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Cursor agent outputs.</strong> When you ask
              Cursor for a migration plan or a refactor proposal,
              publish the result. Reviewers don't need the repo
              open to read it.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Changelogs.</strong> Your{" "}
              <code>CHANGELOG.md</code>, published publicly so users
              can subscribe to a URL instead of starring your repo.
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
          Want the fuller writeup with a sample{" "}
          <code>.cursor/rules</code> rule?{" "}
          <Link
            href="/integrations/cursor"
            style={{ color: "#6941c6", fontWeight: 600 }}
          >
            See the Cursor integration page
          </Link>
          .
        </p>
      </section>

      <MarketingCta title={"Add OpenDocs to your Cursor workflow."} text={"No credit card."} />
    </MarketingShell>
  );
}
