import Link from "next/link";
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
  title: "Free Markdown to Word Converter",
  description:
    "Convert Markdown to Word (.docx) in seconds. Free .md to DOCX converter, no signup. Opens cleanly in Microsoft Word, Google Docs, Pages.",
  url: "https://opendocs.cc/tools/markdown-to-word",
  socialTitle: "Free Markdown to Word Converter | OpenDocs",
});

const faq = [
  {
    q: "Is this Markdown to Word converter really free?",
    a: "Yes. Convert as many .md files to .docx as you want, no account required. There's a per-IP rate limit so nobody can hammer it from a script, but normal use never hits it. For higher limits or custom branding, sign up.",
  },
  {
    q: "What format does it produce?",
    a: "A standard .docx file. That's the modern Word format used by Microsoft Word 2007 onward, Google Docs, LibreOffice Writer, Pages, and pretty much every word processor. It opens cleanly in all of them.",
  },
  {
    q: "What Markdown features are supported?",
    a: "Standard CommonMark plus GitHub-flavored Markdown: headings, lists, tables, code blocks, links, images, blockquotes, horizontal rules. Heading levels and table structure get preserved in the .docx so you can keep editing in Word without the layout falling apart.",
  },
  {
    q: "Are my files private?",
    a: "Yes. The Markdown gets sent to our converter, rendered, and streamed back. We don't store either the source or the result, and we don't log content.",
  },
  {
    q: "Will the Word doc have any branding?",
    a: 'Every .docx from this free tool has a small "Made with OpenDocs" footer. You can delete it in Word in two clicks. For fully branded, footer-free exports, sign up for Pro.',
  },
  {
    q: "What's the file size limit?",
    a: "2 MB per Markdown file. Plenty for hundreds of pages of text. If you have something bigger, split it or use the full platform.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs Markdown to Word Converter",
      description:
        "Free online tool to convert Markdown files to Word (.docx) documents. No signup required.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      url: "https://opendocs.cc/tools/markdown-to-word",
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
          item: "https://opendocs.cc/tools/markdown-to-word",
        },
        {
          "@type": "ListItem",
          position: 3,
          name: "Markdown to Word",
          item: "https://opendocs.cc/tools/markdown-to-word",
        },
      ],
    },
  ],
};

export default async function MarkdownToWordPage() {
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
        <section className="md-tool__hero">
          <span className="md-tool__eyebrow">Free tool</span>
          <h1 className="md-tool__title">
            Convert Markdown to Word
          </h1>
          <p className="md-tool__subtitle">
            Drop in a <code>.md</code> file, get a clean{" "}
            <code>.docx</code> back. Opens in Word, Google Docs,
            Pages, anywhere.
          </p>
        </section>

        <section className="md-tool__container">
          <MarkdownConverter format="docx" tool="markdown-to-word" />
        </section>

        <ExamplePages caption="Signed in, Word and PDF exports carry your workspace theme: brand color, font, logo and footer. These are real exports." />

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">How it works</h2>
          <div className="md-tool__steps">
            <div className="md-tool__step">
              <div className="md-tool__step-num">1</div>
              <h3 className="md-tool__step-title">Upload</h3>
              <p className="md-tool__step-desc">
                Drag in any <code>.md</code> file or click to pick one
                from your computer.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">2</div>
              <h3 className="md-tool__step-title">Convert</h3>
              <p className="md-tool__step-desc">
                We render your Markdown to a Word document with proper
                heading levels, tables, and lists.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">3</div>
              <h3 className="md-tool__step-title">Download</h3>
              <p className="md-tool__step-desc">
                Your <code>.docx</code> downloads automatically. Open it
                in Word, edit it, share it.
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
                <strong>Real Word output, not faked.</strong> Heading
                levels, tables, and lists all map to Word's native
                styles. You can keep editing in Word without the
                layout going sideways.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>No signup, no email harvesting.</strong>{" "}
                Convert, download, leave. We won't ever email you.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Private.</strong> Your file goes to the
                converter, gets rendered, and streams back. Nothing
                stored, nothing logged.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Bridges Markdown and Word.</strong>{" "}
                Engineering writes in Markdown, the people reviewing
                want a Word doc with track changes. This is how you
                hand off without rewriting.
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

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">
            For repeat use, use the CLI
          </h2>
          <p
            style={{
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "#3f3f46",
              margin: "0 0 1rem",
            }}
          >
            One-off Word doc? The drop zone above is fine. If you're
            generating DOCX every day from a script or an agent, the
            CLI is faster. One-line install, one-line publish:
          </p>
          <MarketingCliBlock format="docx" agentMode />
          <p
            style={{
              fontSize: "0.95rem",
              lineHeight: 1.6,
              color: "#52525b",
              margin: "1rem 0 0",
            }}
          >
            <code>--export docx</code> returns a download URL for the
            Word document alongside the published web URL.
          </p>
        </section>

        <section className="md-tool__section">
          <div className="md-tool__crosslink">
            <p className="md-tool__crosslink-text">Need a PDF instead?</p>
            <Link
              href="/tools/markdown-to-pdf"
              className="md-tool__crosslink-link"
            >
              Try the Markdown to PDF converter
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
          <div className="md-tool__crosslink" style={{ marginTop: "1rem" }}>
            <p className="md-tool__crosslink-text">
              Want to share the doc as a URL instead of a Word file?
            </p>
            <Link
              href="/tools/publish-markdown-online"
              className="md-tool__crosslink-link"
            >
              Publish Markdown online (one command)
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </section>

        <ToolCrossLinks current="markdown-to-word" />

        <MarketingCta
          title="Want to publish Markdown as a shareable URL?"
          text="OpenDocs turns your Markdown into a real web document at your own URL. PDF and Word export included."
        />
      </main>
      <LandingFooter />
    </>
  );
}
