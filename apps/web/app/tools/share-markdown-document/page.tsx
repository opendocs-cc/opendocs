
import { MarketingCliBlock } from "@/components/marketing-cli-block";
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";

export const metadata = buildPageMetadata({
  title: "Share a Markdown Document: One Clean Link",
  description:
    "The simplest way to share a Markdown document. Get a clean URL, send it. Private by default, public if you want. Free to start.",
  url: "https://opendocs.cc/tools/share-markdown-document",
  socialTitle: "Share a Markdown Document | OpenDocs",
});

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "OpenDocs: Share Markdown Documents",
  description: "Share a Markdown document via a clean URL in one command.",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  url: "https://opendocs.cc/tools/share-markdown-document",
};

export default async function ShareMarkdownDocumentPage() {
  const session = await getServerSession();

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <MarketingShell isViewerSignedIn={Boolean(session)}>
        <section className="mk-hero">
          <span className="mk-hero__eyebrow">Share Markdown</span>
          <h1 className="mk-hero__title">Share a Markdown document</h1>
          <p className="mk-hero__subtitle">
            Get a clean URL, send it. The recipient opens it in a
            browser like any other page. No repo access required, no
            Obsidian install, no Notion sign-up.
          </p>
        </section>

        <section className="mk-section">
          <h2 className="mk-section__title">Two ways to share</h2>
          <ul className="mk-bullets">
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Workspace link.</strong> Only members of your
                workspace can read it. Good for internal specs,
                postmortems, runbooks.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Public link.</strong> Anyone with the URL can
                read it. Good for changelogs, public notes, anything
                you want to send to a wide audience.
              </p>
            </li>
          </ul>
        </section>

        <section className="mk-section">
          <h2 className="mk-section__title">Sharing in one command</h2>
          <MarketingCliBlock format="url" />
          <p
            style={{
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#52525b",
              margin: "1rem 0 0",
            }}
          >
            The CLI prints the shareable URL on success. Copy, send.
            Re-running on the same file updates the doc and keeps the
            link.
          </p>
        </section>

        <section className="mk-section">
          <h2 className="mk-section__title">Why not just push to GitHub?</h2>
          <div className="mk-section__body">
            <p>
              GitHub is great if your audience already lives there.
              Most don't. A non-developer who lands on a GitHub README
              sees a wall of repo chrome (file tree, branches, commit
              history, contributor avatars) with the actual doc tucked
              into a small panel below all of it.
            </p>
            <p>
              An OpenDocs URL is just the doc. Title at the top, body
              text, code blocks rendered properly, mobile-friendly.
              The page is the content.
            </p>
          </div>
        </section>

      <MarketingCta title={"Send a link, not an attachment."} />
      </MarketingShell>
    </>
  );
}
