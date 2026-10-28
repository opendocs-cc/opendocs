import { TableConverter } from "@/components/free-tools/table-converter";
import { ToolAgentBlock, ToolCrossLinks } from "@/components/free-tools/tool-sections";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";

export const metadata = buildPageMetadata({
  title: "Markdown Table to Word: Convert to an Editable Table",
  description:
    "Paste a Markdown table and download a Word document with a real, editable table. Column alignment and bold text carry over. Free, no signup.",
  url: "https://opendocs.cc/tools/markdown-table-to-word",
  socialTitle: "Markdown Table to Word | OpenDocs",
});

const faq = [
  {
    q: "Is the result a real Word table?",
    a: "Yes. It's a native Word table, not an image or tab-separated text, so you can resize columns, add rows and restyle it in Word, Google Docs or Pages.",
  },
  {
    q: "Does alignment carry over?",
    a: "Yes. Colons in the separator row (:--- left, :---: center, ---: right) set each column's alignment. Bold, italics, links and inline code inside cells carry over too.",
  },
  {
    q: "Can I convert several tables, or text around them?",
    a: "Yes. Paste the whole Markdown: headings, paragraphs and any number of tables all end up in the document.",
  },
  {
    q: "Where do I get a Markdown table?",
    a: "AI assistants like ChatGPT and Claude write tables in Markdown, and so do GitHub, Notion exports and most note apps. Copy it with the copy button or as raw text.",
  },
  {
    q: "Is it free?",
    a: "Yes, with no account. Each file ends with a small \"Made with OpenDocs\" footer. There's a per-address limit (5 a minute, 30 an hour, 100 a day) so nobody can run it from a script.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs Markdown Table to Word",
      description: "Free tool to convert Markdown tables to editable Word tables. No signup required.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://opendocs.cc/tools/markdown-table-to-word",
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
          name: "Markdown table to Word",
          item: "https://opendocs.cc/tools/markdown-table-to-word",
        },
      ],
    },
  ],
};

export default async function MarkdownTableToWordPage() {
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
          <h1 className="md-tool__title">Markdown table to Word</h1>
          <p className="md-tool__subtitle">
            Paste a Markdown table and get a Word document with a real, editable table. Alignment and formatting carry
            over.
          </p>
        </section>

        <section className="md-tool__container md-tool__container--wide">
          <TableConverter />
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">How it works</h2>
          <div className="md-tool__steps">
            <div className="md-tool__step">
              <div className="md-tool__step-num">1</div>
              <h3 className="md-tool__step-title">Paste</h3>
              <p className="md-tool__step-desc">Paste a table, or a whole document with tables in it.</p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">2</div>
              <h3 className="md-tool__step-title">Convert</h3>
              <p className="md-tool__step-desc">Each Markdown table becomes a native Word table.</p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">3</div>
              <h3 className="md-tool__step-title">Edit</h3>
              <p className="md-tool__step-desc">Open it in Word, Google Docs or Pages and keep working.</p>
            </div>
          </div>
        </section>

        <ToolAgentBlock format="docx" source="markdown-table-to-word">
          Agents write tables in Markdown all the time. With OpenDocs set up, yours can publish the result and hand
          you a Word file in one step.
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

        <ToolCrossLinks current="markdown-table-to-word" />

        <MarketingCta
          title="More than tables"
          text="OpenDocs publishes Markdown as shareable pages and exports them to PDF and Word with your own branding."
        />
      </main>
      <LandingFooter />
    </>
  );
}
