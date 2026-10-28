import { AnonymousPublishTool } from "@/components/free-tools/anonymous-publish-tool";
import { ToolAgentBlock, ToolCrossLinks } from "@/components/free-tools/tool-sections";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { getServerSession } from "@/lib/auth/session";
import { PUBLISH_SAMPLE } from "@/lib/free-tools/samples";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";

// Also served at /try (a permanent redirect in next.config.ts), the short
// link for launch posts.
export const metadata = buildPageMetadata({
  title: "Publish Markdown Online: Paste It, Get a Link",
  description:
    "Paste Markdown and get a shareable link in one click. No signup. Tables, code and callouts render properly, and the link works for 24 hours; sign up free to keep it.",
  url: "https://opendocs.cc/tools/publish-markdown-online",
  socialTitle: "Publish Markdown Online, No Signup | OpenDocs",
});

// Mirrored into the FAQPage JSON-LD below; keep both in step.
const faq = [
  {
    q: "Do I need an account?",
    a: "No. Paste your Markdown, press Publish and you get a link. An account only matters if you want to keep the page past 24 hours.",
  },
  {
    q: "How long does the link work?",
    a: "24 hours from when you publish. Then the page is deleted. Editing it and updating the link doesn't reset the clock.",
  },
  {
    q: "How do I keep it?",
    a: "Use \"Keep it: sign up free\" after publishing. Once you're signed in, the page moves into your workspace as a normal document, private to your team until you share it, and the anonymous link stops working.",
  },
  {
    q: "Who can see what I publish?",
    a: "Anyone you give the link to. The address is random and long, so it can't be guessed, and the page is marked so search engines don't index it. Don't publish anything you wouldn't want forwarded.",
  },
  {
    q: "What Markdown works?",
    a: "GitHub-flavored Markdown: headings, tables, task lists, code blocks with syntax highlighting, callouts like > [!NOTE], footnotes and math. Up to 512 KB of text per page.",
  },
  {
    q: "Are there limits?",
    a: "A few, to keep it working for everyone: 20 publishes and updates an hour and 50 new links a day from one address. Signed-in publishing has much higher limits and no expiry.",
  },
  {
    q: "Can my agent do this?",
    a: "Yes. opendocs publish notes.md --anonymous does the same from the command line and returns the link and a claim link as JSON, so Claude Code, Cursor or Codex can hand it to you.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs: Publish Markdown Online",
      description: "Paste Markdown and get a shareable link. No signup required.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://opendocs.cc/tools/publish-markdown-online",
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "OpenDocs", item: "https://opendocs.cc" },
        {
          "@type": "ListItem",
          position: 2,
          name: "Publish Markdown online",
          item: "https://opendocs.cc/tools/publish-markdown-online",
        },
      ],
    },
  ],
};

export default async function PublishMarkdownOnlinePage() {
  const session = await getServerSession();

  return (
    <>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingNav authenticated={Boolean(session)} />
      <main className="md-tool">
        <section className="md-tool__hero md-tool__hero--compact">
          <span className="md-tool__eyebrow">Free tool, no signup</span>
          <h1 className="md-tool__title">Paste Markdown, get a link</h1>
          <p className="md-tool__subtitle">
            Publish any Markdown as a clean web page in one click. Share the link, download a PDF, and keep it if you
            sign up.
          </p>
        </section>

        <section className="md-tool__container md-tool__container--wide">
          <AnonymousPublishTool sample={PUBLISH_SAMPLE} signedIn={Boolean(session)} />
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">How it works</h2>
          <div className="md-tool__steps">
            <div className="md-tool__step">
              <div className="md-tool__step-num">1</div>
              <h3 className="md-tool__step-title">Paste</h3>
              <p className="md-tool__step-desc">
                Write or paste Markdown. Notes, a spec, an answer from your AI assistant.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">2</div>
              <h3 className="md-tool__step-title">Publish</h3>
              <p className="md-tool__step-desc">
                You get a link to a typeset page, with tables, code and callouts rendered.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">3</div>
              <h3 className="md-tool__step-title">Share or keep</h3>
              <p className="md-tool__step-desc">
                Send the link, download a PDF, or sign up free to keep the page.
              </p>
            </div>
          </div>
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">Why a link</h2>
          <ul className="md-tool__why-list">
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Readable anywhere.</strong> The page works on a phone, in Slack previews and in any browser.
                Nobody needs an account or a Markdown viewer.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>No formatting by hand.</strong> Pasting into Notion or Google Docs mangles code blocks and
                tables. Here they come out as you wrote them.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Edit after sharing.</strong> Change the text and update the link; people with it see the new
                version.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Keep it when it matters.</strong> With a free account the page moves into your workspace,
                private by default, with PDF and Word export and no expiry.
              </p>
            </li>
          </ul>
        </section>

        <ToolAgentBlock format="url" anonymous source="publish-markdown-online">
          The CLI publishes the same way without an account, so an agent can give you a link to whatever it just
          wrote. Signed in, links don&apos;t expire and live in your workspace.
        </ToolAgentBlock>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">FAQ</h2>
          {faq.map((item) => (
            <div key={item.q} className="md-tool__faq-item">
              <h3 className="md-tool__faq-q">{item.q}</h3>
              <p className="md-tool__faq-a">{item.a}</p>
            </div>
          ))}
        </section>

        <ToolCrossLinks current="publish-markdown-online" />

        <MarketingCta
          title="Keep your documents"
          text="A free account keeps every page you publish, private to your team by default, with PDF and Word export."
        />
      </main>
      <LandingFooter />
    </>
  );
}
