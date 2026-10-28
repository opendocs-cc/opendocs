import { ArrowRight } from "lucide-react";

import { ToolCrossLinks } from "@/components/free-tools/tool-sections";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { MarkdownConverter } from "@/components/markdown-converter";
import { MarketingCliBlock } from "@/components/marketing-cli-block";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { ExamplePages } from "@/components/marketing/example-pages";

export const metadata = buildPageMetadata({
  title: "Free Markdown to PDF Converter",
  description:
    "Convert any Markdown file to a clean, professional PDF in seconds. Free, no signup required. Drag, drop, download.",
  url: "https://opendocs.cc/tools/markdown-to-pdf",
  socialTitle: "Free Markdown to PDF Converter | OpenDocs",
});

// FAQ content. Mirrored into the FAQPage JSON-LD below so search
// engines surface it as a rich result. Both copies stay in lockstep —
// don't add to one without the other.
const faq = [
  {
    q: "Is this Markdown to PDF converter really free?",
    a: "Yes. Convert as many .md files as you want, no account needed. There's a per-IP rate limit so nobody can hammer it from a script, but normal use never hits it. For higher limits or your own branding (logo, fonts, footer copy), sign up.",
  },
  {
    q: "What Markdown features are supported?",
    a: "Standard CommonMark plus GitHub-flavored Markdown: headings, lists, tables, code blocks with syntax highlighting, links, images, blockquotes, horizontal rules, inline HTML.",
  },
  {
    q: "Are my files private?",
    a: "Yes. The Markdown gets sent to our converter, rendered, and streamed back. We don't store either the source or the result, and we don't log content.",
  },
  {
    q: "Will the PDF have any branding?",
    a: 'Yes. Every PDF from this free tool carries a small "Made with OpenDocs" footer. Sign up free to use your own logo, font, and brand color; Pro replaces the footer with your own.',
  },
  {
    q: "What's the file size limit?",
    a: "2 MB per Markdown file. That covers hundreds of pages of text. If you've got something bigger, split it or use the full platform.",
  },
  {
    q: "Can I batch convert multiple files?",
    a: "Not on the free tool, no. One file at a time. With an account you can publish or export up to 10 files at once through the dashboard or the CLI.",
  },
];

// JSON-LD structured data for rich snippets in search results. We
// stamp three blocks:
//   1. SoftwareApplication — Google sometimes uses this on tool pages
//      to render an "App" card with category + price.
//   2. FAQPage — picked up for the expandable Q&A rich result.
//   3. BreadcrumbList — small, but helps the URL display in SERP.
// All three are inlined as a single <script> for fewer round-trips.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs Markdown to PDF Converter",
      description:
        "Free online tool to convert Markdown files to PDF. No signup required.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      url: "https://opendocs.cc/tools/markdown-to-pdf",
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "OpenDocs",
          item: "https://opendocs.cc",
        },
        {
          "@type": "ListItem",
          position: 2,
          name: "Tools",
          item: "https://opendocs.cc/tools/markdown-to-pdf",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Markdown to PDF",
          item: "https://opendocs.cc/tools/markdown-to-pdf",
        },
      ],
    },
  ],
};

export default async function MarkdownToPdfPage() {
  const session = await getServerSession();

  return (
    <>
      <script
        type="application/ld+json"
        // JSON.stringify is the safe way to embed JSON-LD; React
        // escapes the contents and Google parses the script body.
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <LandingNav authenticated={Boolean(session)} />
      <main className="md-tool">
        {/* Hero — H1 matches the meta title intent so the SERP click
            and the on-page header reinforce each other. */}
        <section className="md-tool__hero">
          <span className="md-tool__eyebrow">Free tool</span>
          <h1 className="md-tool__title">Convert Markdown to PDF</h1>
          <p className="md-tool__subtitle">
            Drop in a <code>.md</code> file and get a clean PDF back. No
            account, no email, no nonsense.
          </p>
        </section>

        <section className="md-tool__container">
          <MarkdownConverter format="pdf" tool="markdown-to-pdf" />
        </section>

        <ExamplePages caption="No account needed for the converter. With a Pro workspace, every export carries your own colors, font and logo, like these real exports." />

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">How it works</h2>
          <div className="md-tool__steps">
            <div className="md-tool__step">
              <div className="md-tool__step-num">1</div>
              <h3 className="md-tool__step-title">Upload</h3>
              <p className="md-tool__step-desc">
                Drag in any <code>.md</code> file or click to pick one from your
                computer.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">2</div>
              <h3 className="md-tool__step-title">Convert</h3>
              <p className="md-tool__step-desc">
                We render your Markdown to a clean PDF using the same engine
                that powers OpenDocs exports.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">3</div>
              <h3 className="md-tool__step-title">Download</h3>
              <p className="md-tool__step-desc">
                Your PDF downloads automatically. Yours to share, print, or
                attach to whatever you want.
              </p>
            </div>
          </div>
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">Why use this</h2>
          <ul className="md-tool__why-list">
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>No signup, no email harvesting.</strong> Convert,
                download, leave. We won't ever email you.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Real Markdown support.</strong> Tables, code blocks with
                syntax highlighting, GFM extensions, all rendered by the same
                engine our paid customers use.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Private.</strong> Your file goes to the converter, gets
                rendered, and streams back. Nothing stored, nothing logged.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Plays nicely with agents.</strong> If you're using
                Claude Code or Cursor, pipe their Markdown output through here
                and ship a PDF in one step.
              </p>
            </li>
          </ul>
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">FAQ</h2>
          {faq.map((item) => (
            <div key={item.q} className="md-tool__faq-item">
              <h3 className="md-tool__faq-q">{item.q}</h3>
              <p className="md-tool__faq-a">{item.a}</p>
            </div>
          ))}
        </section>

        <ToolCrossLinks current="markdown-to-pdf" />

      <MarketingCta title={"Want a shareable URL instead of a download?"} text={"OpenDocs publishes your Markdown to a real URL, with PDF and Word export included."} />
      </main>
      <LandingFooter />
    </>
  );
}
