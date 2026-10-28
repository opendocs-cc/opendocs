
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";

export const metadata = buildPageMetadata({
  title: "OpenDocs vs GitBook: When to Use Each",
  description:
    "GitBook is a docs site builder. OpenDocs is one-command publishing for individual Markdown documents and AI agent outputs. Honest comparison of when each fits.",
  url: "https://opendocs.cc/compare/opendocs-vs-gitbook",
  socialTitle: "OpenDocs vs GitBook | OpenDocs",
});

export default async function OpenDocsVsGitbookPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Comparison</span>
        <h1 className="mk-hero__title">OpenDocs vs GitBook</h1>
        <p className="mk-hero__subtitle">
          GitBook builds docs <em>sites</em> with multi-page
          navigation, search, themes, the whole site. OpenDocs
          publishes individual <em>documents</em>. One file, one URL,
          no navigation tree to maintain.
        </p>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">When GitBook is right</h2>
        <div className="mk-section__body">
          <p>
            GitBook shines when you need a structured docs site: an
            SDK reference, a user manual, a knowledge base with
            chapters and a sidebar. Things readers navigate through,
            not single docs they read once.
          </p>
          <p>
            If your output is "we have 80 pages of API documentation
            organised into 12 sections," GitBook is built for that.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">When OpenDocs is right</h2>
        <div className="mk-section__body">
          <p>
            OpenDocs is for the case where the doc <em>is</em> the
            artifact: a spec, a postmortem, an agent's audit report,
            a client deliverable. You don't want a sidebar, you want
            a URL to send.
          </p>
          <p>
            If your output is "I have a Markdown file, I want a
            shareable URL, I'm doing this dozens of times a week,"
            GitBook is overkill. It expects you to set up a project,
            wire up a sidebar, configure a theme. OpenDocs is one
            CLI command per file.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Side by side</h2>
        <div className="mk-compare">
          <div className="mk-compare__col">
            <h3 className="mk-compare__col-title">GitBook</h3>
            <ul className="mk-compare__col-list">
              <li>Builds a multi-page docs site with sidebar navigation</li>
              <li>Themes, custom domains, search across the whole site</li>
              <li>Optimised for product and SDK documentation</li>
              <li>Per-space pricing; setup is project-level</li>
              <li>Real-time editing in the GitBook web app</li>
              <li>The unit is the site (or "space"), not the doc</li>
            </ul>
          </div>
          <div className="mk-compare__col mk-compare__col--accent">
            <h3 className="mk-compare__col-title">OpenDocs</h3>
            <ul className="mk-compare__col-list">
              <li>Publishes individual Markdown files to URLs</li>
              <li>No sidebar, no nav tree, no theme to configure; your own domain on Pro</li>
              <li>Optimised for one-off docs and AI agent outputs</li>
              <li>One CLI command per file, no project setup</li>
              <li>Editing happens in your editor, not in the browser</li>
              <li>The unit is the document; each one stands alone</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Use both</h2>
        <div className="mk-section__body">
          <p>
            They're complementary. Use GitBook for the documentation
            site you maintain over years. Use OpenDocs for the audit
            report you finished today, the postmortem from
            yesterday's incident, or the agent-generated migration
            plan for next quarter.
          </p>
          <p>
            Different docs, different tools.
          </p>
        </div>
      </section>

      <MarketingCta title={"One file, one URL, one command."} text={"No project setup, no sidebar to maintain."} />
    </MarketingShell>
  );
}
