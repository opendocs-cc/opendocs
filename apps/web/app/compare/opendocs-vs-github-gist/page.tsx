
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";

export const metadata = buildPageMetadata({
  title: "OpenDocs vs GitHub Gist: When to Use Each",
  description:
    "Gist is great for code snippets. OpenDocs is built for readable documents: private workspaces, branded exports, and AI-agent workflows. Honest comparison.",
  url: "https://opendocs.cc/compare/opendocs-vs-github-gist",
  socialTitle: "OpenDocs vs GitHub Gist | OpenDocs",
});

export default async function OpenDocsVsGistPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Comparison</span>
        <h1 className="mk-hero__title">OpenDocs vs GitHub Gist</h1>
        <p className="mk-hero__subtitle">
          Both let you publish a Markdown file to a URL. They're
          built for different things. Gist for snippets and quick
          shares, OpenDocs for readable documents that need to look
          polished.
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Where Gist excels</h2>
        <div className="mk-section__body">
          <p>
            Gist is perfect when you need to share a code snippet or
            a one-off file with someone fast. It's free, it requires
            zero setup beyond a GitHub account, and the URL stays
            alive forever. If you've ever pasted a stack trace into
            Slack and someone said "make a gist," that's exactly the
            workflow it nails.
          </p>
          <p>
            For code-first sharing (a config file, a script someone
            asked for, a debug log), Gist is the right tool. It also
            handles version history, since each edit is a commit, and
            multiple files per gist.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Where OpenDocs is better</h2>
        <div className="mk-section__body">
          <p>
            For long-form documents, Gist's rendering is a code-first
            interface. You see line numbers, a small "Raw" button,
            GitHub's repo chrome. Fine for a script, distracting for
            a postmortem.
          </p>
          <p>
            OpenDocs renders Markdown as a document. Title, body,
            mobile-friendly typography, no line numbers, no repo
            chrome. The page is just the content.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Side by side</h2>
        <div className="mk-compare">
          <div className="mk-compare__col">
            <h3 className="mk-compare__col-title">GitHub Gist</h3>
            <ul className="mk-compare__col-list">
              <li>Best for code snippets and one-off files</li>
              <li>Public or secret (URL-only). No fine-grained sharing</li>
              <li>Renders with code-editor chrome (line numbers, raw button)</li>
              <li>No exports. Viewers see HTML or raw</li>
              <li>No custom branding</li>
              <li>Tied to a GitHub account</li>
              <li>Version history via git commits</li>
            </ul>
          </div>
          <div className="mk-compare__col mk-compare__col--accent">
            <h3 className="mk-compare__col-title">OpenDocs</h3>
            <ul className="mk-compare__col-list">
              <li>Best for readable documents: specs, audits, reports</li>
              <li>Public or workspace-only visibility</li>
              <li>Renders as a clean document, no code-editor chrome</li>
              <li>One-click PDF and DOCX exports</li>
              <li>Branded PDF exports on every plan (your logo, colors, fonts)</li>
              <li>Workspace concept lets you share access with a team</li>
              <li>Re-publishing replaces content; URL stays the same</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Which to use when</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>"I need to share a config snippet right now"</strong>:
              Gist.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>"I'm sharing a one-off file with a developer who'll grep it"</strong>:
              Gist.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>"I'm sharing a postmortem with the eng team and want them to read it"</strong>:
              OpenDocs.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>"I'm sending an audit report to a client and need a branded PDF"</strong>:
              OpenDocs.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>"My AI agent writes Markdown and needs to publish each output"</strong>:
              OpenDocs. Gist's API exists, but it isn't built for
              this loop.
            </p>
          </li>
        </ul>
      </section>

      <MarketingCta title={"For readable docs, use the right tool."} text={"No GitHub account required."} />
    </MarketingShell>
  );
}
