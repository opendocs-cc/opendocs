import { ReadmeConverter } from "@/components/free-tools/readme-converter";
import { ToolAgentBlock, ToolCrossLinks } from "@/components/free-tools/tool-sections";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { getServerSession } from "@/lib/auth/session";
import { README_SAMPLE } from "@/lib/free-tools/samples";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";

export const metadata = buildPageMetadata({
  title: "README to PDF or Word: Convert a GitHub README",
  description:
    "Turn a GitHub README into a clean PDF or Word document. Paste a repository link or the README itself. Free, no signup.",
  url: "https://opendocs.cc/tools/readme-to-pdf",
  socialTitle: "README to PDF or Word | OpenDocs",
});

const faq = [
  {
    q: "Which links work?",
    a: "A repository (github.com/owner/repo or just owner/repo), a folder in one (…/tree/main/docs), or a Markdown file (…/blob/main/docs/guide.md or a raw.githubusercontent.com link). For anything else, paste the text.",
  },
  {
    q: "Does it work with private repositories?",
    a: "No. Your browser fetches the README from GitHub without signing in, so only public repositories work. For a private one, open the README on GitHub, copy the raw text and paste it here.",
  },
  {
    q: "What about images and relative links?",
    a: "Relative image paths and links are pointed at the repository on GitHub, so badges, screenshots and links to other files keep working in the PDF.",
  },
  {
    q: "Does my repository go through your servers?",
    a: "The README is fetched by your browser, straight from GitHub. Only the text you convert is sent to our converter, and it isn't stored.",
  },
  {
    q: "Is there a limit?",
    a: "2 MB of Markdown per file, and 5 conversions a minute, 30 an hour and 100 a day from one address. GitHub also allows 60 fetches an hour per address without an account; past that, paste the README instead.",
  },
  {
    q: "Can I publish a README as a web page?",
    a: "Yes. After converting, \"Publish it as a link\" makes a page anyone can open for 24 hours. With an account, your agent can publish the docs folder of a repository and keep it in sync.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs README to PDF",
      description: "Free tool to convert a GitHub README to PDF or Word. No signup required.",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://opendocs.cc/tools/readme-to-pdf",
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
        { "@type": "ListItem", position: 2, name: "README to PDF", item: "https://opendocs.cc/tools/readme-to-pdf" },
      ],
    },
  ],
};

export default async function ReadmeToPdfPage() {
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
          <h1 className="md-tool__title">README to PDF or Word</h1>
          <p className="md-tool__subtitle">
            Paste a GitHub repository link or the README itself, and get a clean document to send, print or attach.
          </p>
        </section>

        <section className="md-tool__container md-tool__container--wide">
          <ReadmeConverter sample={README_SAMPLE} />
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">How it works</h2>
          <div className="md-tool__steps">
            <div className="md-tool__step">
              <div className="md-tool__step-num">1</div>
              <h3 className="md-tool__step-title">Point at a repo</h3>
              <p className="md-tool__step-desc">
                Enter a GitHub repository and fetch its README, or paste the text.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">2</div>
              <h3 className="md-tool__step-title">Pick a format</h3>
              <p className="md-tool__step-desc">PDF for sending and printing, Word for editing.</p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">3</div>
              <h3 className="md-tool__step-title">Download</h3>
              <p className="md-tool__step-desc">Code blocks, tables and badges come out as they look on GitHub.</p>
            </div>
          </div>
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">When it helps</h2>
          <ul className="md-tool__why-list">
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Handing a project to someone outside GitHub.</strong> A client, a reviewer or a grant
                committee gets a document instead of a link to a repository.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Docs for an offline or regulated setting.</strong> Attach the PDF to a ticket, an audit or a
                release package.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Editing in Word.</strong> The .docx keeps headings and tables as Word styles, so non-developers
                can work on it.
              </p>
            </li>
          </ul>
        </section>

        <ToolAgentBlock format="pdf" source="readme-to-pdf">
          Working in the repository already? Your agent can publish the README, or the whole docs folder, and export
          it as PDF in one command.
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

        <ToolCrossLinks current="readme-to-pdf" />

        <MarketingCta
          title="Publish your docs, not just export them"
          text="OpenDocs publishes Markdown from your repository as shareable pages, with PDF and Word export included."
        />
      </main>
      <LandingFooter />
    </>
  );
}
