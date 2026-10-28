import type { Metadata } from "next";
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

/**
 * `/tools/markdown-to-docx` — the Markdown-to-Word page under the name
 * developers search for ("md to docx" more than "md to word"). Same
 * converter, same UX, with the H1 and meta description in DOCX terms.
 * `alternates.canonical` points at the Word page, so search engines
 * treat the two as one page rather than near-duplicates.
 */
const baseMetadata = buildPageMetadata({
  title: "Free Markdown to DOCX Converter",
  description:
    "Convert .md to DOCX in seconds. Free Markdown to DOCX converter, no signup. Output opens cleanly in Microsoft Word, Google Docs, and Pages.",
  url: "https://opendocs.cc/tools/markdown-to-docx",
  socialTitle: "Free Markdown to DOCX Converter | OpenDocs",
});

export const metadata: Metadata = {
  ...baseMetadata,
  alternates: {
    ...(baseMetadata.alternates ?? {}),
    canonical: "https://opendocs.cc/tools/markdown-to-word",
  },
};

const faq = [
  {
    q: "What's the difference between DOCX and Word?",
    a: "Nothing, really. DOCX is the file extension Microsoft Word has used since 2007. Any Word document you've opened in the last fifteen years is a .docx file. We use both terms here because people search for both.",
  },
  {
    q: "Will the .docx open in non-Microsoft apps?",
    a: "Yes. Google Docs, Apple Pages, LibreOffice Writer, and pretty much every modern word processor open .docx natively. Heading levels, lists, and tables come through as native styles, so the doc stays fully editable in whichever one you use.",
  },
  {
    q: "Are my files private?",
    a: "Yes. The Markdown gets sent to our converter, rendered, and streamed back. We don't store either the source or the result, and we don't log content.",
  },
  {
    q: "Will the DOCX have any branding?",
    a: 'Every .docx from this free tool has a small "Made with OpenDocs" footer. You can delete it in Word in two clicks. For fully branded, footer-free exports, sign up for Pro.',
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs Markdown to DOCX Converter",
      description:
        "Free online tool to convert Markdown files to DOCX. No signup required.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://opendocs.cc/tools/markdown-to-word",
    },
    {
      "@type": "FAQPage",
      mainEntity: faq.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },
  ],
};

export default async function MarkdownToDocxPage() {
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
          <h1 className="md-tool__title">Convert Markdown to DOCX</h1>
          <p className="md-tool__subtitle">
            Drop in a <code>.md</code> file, get a clean{" "}
            <code>.docx</code> back. Same engine, same output, same
            zero-signup workflow as our{" "}
            <Link
              href="/tools/markdown-to-word"
              style={{ color: "#6941c6", fontWeight: 600 }}
            >
              Markdown to Word converter
            </Link>
            .
          </p>
        </section>

        <section className="md-tool__container">
          <MarkdownConverter format="docx" tool="markdown-to-docx" />
        </section>

        <ExamplePages caption="Signed in, Word and PDF exports carry your workspace theme: brand color, font, logo and footer. These are real exports." />

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">For repeat use, use the CLI</h2>
          <p
            style={{
              fontSize: "1rem",
              lineHeight: 1.65,
              color: "#3f3f46",
              margin: "0 0 1rem",
            }}
          >
            One DOCX is fine through the drop zone. If you're
            generating a stack of them every week from a script or an
            agent, skip the upload step entirely:
          </p>
          <MarketingCliBlock format="docx" agentMode />
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
        </section>

        <ToolCrossLinks current="markdown-to-docx" />

        <MarketingCta
          title="Want a shareable URL instead of a download?"
          text="OpenDocs publishes your Markdown to a real URL, with PDF and DOCX export included."
        />
      </main>
      <LandingFooter />
    </>
  );
}
