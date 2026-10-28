
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { ExamplePages } from "@/components/marketing/example-pages";

export const metadata = buildPageMetadata({
  title: "Simple Private Docs for Markdown-First Teams",
  description:
    "A lightweight publishing layer for teams that already write everything in Markdown. Not a Notion replacement: the missing step between your repo and your team.",
  url: "https://opendocs.cc/use-cases/internal-docs",
  socialTitle: "Internal Docs for Markdown Teams | OpenDocs",
});

export default async function InternalDocsPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Use case</span>
        <h1 className="mk-hero__title">
          Simple private docs for Markdown-first teams
        </h1>
        <p className="mk-hero__subtitle">
          For small engineering teams, startups, and founders who
          already write in Markdown. OpenDocs isn't trying to replace
          Notion. It's the missing step between <code>docs/</code> in
          the repo and <em>"can someone send me that runbook?"</em>
        </p>
      </section>

      <ExamplePages
        slugs={["staff-handbook", "product-spec", "investor-update"]}
        caption="Handbooks, specs and updates exported from Markdown with your workspace theme."
      />

      <section className="mk-section">
        <h2 className="mk-section__title">What this is, what it isn't</h2>
        <div className="mk-section__body">
          <p>
            What it is: a one-command publishing layer. You have a
            Markdown file, you want it readable at a URL, you run{" "}
            <code>opendocs publish</code> and you have one.
            Workspace-only by default, public if you want.
          </p>
          <p>
            What it isn't: a wiki, a project tracker, a database, a
            real-time collaborative editor, or any of the other
            things that come up when teams say "we should set up
            Notion." If your team needs a knowledge base with linked
            pages and embedded databases, this isn't that.
          </p>
          <p>
            It's the simpler thing. For teams that keep their docs in
            the repo and just need a way to share them.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">When this is right for your team</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>You already write in Markdown.</strong> Your
              README, your ADRs, your runbooks all live as{" "}
              <code>.md</code> files. Switching to Notion would mean
              copy-pasting hundreds of files.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Your team is small.</strong> Five engineers,
              ten engineers. The cost of running a wiki and
              maintaining it is more than just sharing files.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>You use AI agents.</strong> Claude Code, Cursor,
              Codex. They all output Markdown. OpenDocs lets them
              publish that output without bouncing through a wiki.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Source-of-truth lives in git.</strong> The doc
              is in the repo. The published version is just a
              snapshot. Re-publishing keeps the URL stable.
            </p>
          </li>
        </ul>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">When you should use Notion instead</h2>
        <div className="mk-section__body">
          <p>
            Honestly, plenty of teams. If you need:
          </p>
          <ul className="mk-bullets">
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                A linked knowledge base with backlinks and embedded
                queries: Notion or Obsidian Publish.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                A wiki that non-technical people will edit directly:
                Notion or Confluence.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                A real-time collaborative editor: Google Docs or
                Notion.
              </p>
            </li>
          </ul>
          <p>
            We're not the right tool for any of those. We're the
            right tool when your team's docs already live in Markdown
            and the sharing step is what's broken.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">What teams publish</h2>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Runbooks.</strong> On-call docs, incident
              response. Workspace-only link.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>ADRs.</strong> Architecture decision records.
              Often public so the broader org can read them.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Postmortems.</strong> Blameless writeups,
              workspace-internal so the conversation stays focused.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Onboarding docs.</strong> The README a new
              hire sees on day one.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>Specs and PRDs.</strong> Drafted in the repo,
              published for review.
            </p>
          </li>
        </ul>
      </section>

      <MarketingCta title={"Keep writing in Markdown. We'll handle the URL."} text={"Pro adds unlimited docs and Word export."} />
    </MarketingShell>
  );
}
