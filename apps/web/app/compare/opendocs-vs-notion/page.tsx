
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";

export const metadata = buildPageMetadata({
  title: "OpenDocs vs Notion: When to Use Each",
  description:
    "Notion is a workspace. OpenDocs is a publishing layer for Markdown. Honest comparison of when each tool is the right answer.",
  url: "https://opendocs.cc/compare/opendocs-vs-notion",
  socialTitle: "OpenDocs vs Notion | OpenDocs",
});

export default async function OpenDocsVsNotionPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Comparison</span>
        <h1 className="mk-hero__title">OpenDocs vs Notion</h1>
        <p className="mk-hero__subtitle">
          We're not trying to replace Notion. Notion is a workspace
          for everything. OpenDocs is a publishing layer for the
          specific case where your source-of-truth is Markdown.
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">The honest position</h2>
        <div className="mk-section__body">
          <p>
            Use Notion as your team's workspace. Tasks, meeting
            notes, full project management, knowledge base, wiki.
            Notion is excellent at all of it. If your team's already
            standardised on Notion, keep using it.
          </p>
          <p>
            Use OpenDocs when your source-of-truth is Markdown.
            README files, ADRs, runbooks, AI agent outputs, technical
            specs that live in <code>docs/</code> in your repo. The
            kind of doc that's already a <code>.md</code> file and
            would lose structure if you pasted it into Notion.
          </p>
          <p>
            We do have lightweight projects (you can group docs into
            named projects from the CLI to keep workspaces tidy), but
            it's just organisation, not project management. No tasks,
            no databases, no kanban. If you need any of that, Notion
            is the right tool.
          </p>
          <p>
            Using both at once is fine. Most of the teams we talk to
            use Notion for project tracking and OpenDocs for{" "}
            <em>"this is the canonical version of the spec, here's
            the URL to reference."</em>
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Side by side</h2>
        <div className="mk-compare">
          <div className="mk-compare__col">
            <h3 className="mk-compare__col-title">Notion</h3>
            <ul className="mk-compare__col-list">
              <li>Rich workspace: pages, databases, calendars, tasks</li>
              <li>Real-time collaborative editing</li>
              <li>Inline comments, mentions, threads</li>
              <li>Backlinks, embedded queries, relational databases</li>
              <li>Per-user pricing scales with team size</li>
              <li>Source-of-truth lives in Notion's database</li>
              <li>Editing is the primary mode</li>
            </ul>
          </div>
          <div className="mk-compare__col mk-compare__col--accent">
            <h3 className="mk-compare__col-title">OpenDocs</h3>
            <ul className="mk-compare__col-list">
              <li>Publishing layer plus lightweight CLI projects (no tasks, no databases)</li>
              <li>Source files stay in your editor or repo</li>
              <li>One CLI command publishes a Markdown file to a URL</li>
              <li>Workspace-only or public visibility</li>
              <li>PDF and DOCX export with your branding</li>
              <li>Source-of-truth lives in your repo or filesystem</li>
              <li>Reading is the primary mode; editing happens in your editor</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">When OpenDocs is the right answer</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              Your team already writes everything in Markdown and
              isn't keen on rewriting it.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              You're using AI agents (Claude Code, Cursor) that
              produce Markdown and you need them to publish it
              automatically.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              You want PDFs and DOCX exports with your own branding
              instead of Notion's.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              You want documents that read as documents, not as
              Notion pages.
            </p>
          </li>
        </ul>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">When Notion is the right answer</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              You need real-time collaborative editing with multiple
              people in the same doc at once.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              You want a wiki with linked pages, embedded databases,
              and project tracking in one place.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              Your audience is non-technical and won't write or read
              Markdown comfortably.
            </p>
          </li>
        </ul>
      </section>

      <MarketingCta title={"Ship Markdown without leaving your editor."} text={"No credit card."} />
    </MarketingShell>
  );
}
