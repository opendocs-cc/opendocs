import { ToolAgentBlock, ToolCrossLinks } from "@/components/free-tools/tool-sections";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { MarkdownConverter } from "@/components/markdown-converter";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { getServerSession } from "@/lib/auth/session";
import { AI_ANSWER_SAMPLE } from "@/lib/free-tools/samples";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";

// /tools/ai-chat-to-pdf redirects here (next.config.ts). "ChatGPT to PDF"
// is what people search for; the page covers Claude and Gemini too.
export const metadata = buildPageMetadata({
  title: "ChatGPT to PDF: Save AI Answers as PDF or Word",
  description:
    "Paste an answer from ChatGPT, Claude or Gemini and download a typeset PDF or Word file. Tables and code blocks come out right. Free, no signup.",
  url: "https://opendocs.cc/tools/chatgpt-to-pdf",
  socialTitle: "ChatGPT to PDF, Free and No Signup | OpenDocs",
});

const faq = [
  {
    q: "How do I copy an answer as Markdown?",
    a: "Use the copy button under the answer rather than selecting the text. ChatGPT, Claude and Gemini all copy answers as Markdown that way, which keeps headings, tables and code blocks intact.",
  },
  {
    q: "Can I export a whole ChatGPT or Claude conversation?",
    a: "Paste as many answers as you like into the box, one after another. Add a heading above each (## Question 1) if you want them separated in the PDF.",
  },
  {
    q: "Why not just print the chat page to PDF?",
    a: "Printing the chat page includes the sidebar and buttons, cuts tables and code at page edges, and often splits lines mid-page. This typesets the answer itself: proper headings, tables that fit, highlighted code.",
  },
  {
    q: "Is it really free?",
    a: "Yes, with no account. There's a per-address limit (5 a minute, 30 an hour, 100 a day) so nobody can run it from a script. Each file ends with a small \"Made with OpenDocs\" footer.",
  },
  {
    q: "Do you keep what I paste?",
    a: "No. The text goes to our converter, the file comes back, and neither is stored or logged.",
  },
  {
    q: "Can I share it as a link instead?",
    a: "Yes. After converting, \"Publish it as a link\" turns the same answer into a web page anyone can open for 24 hours, no account needed.",
  },
];

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "OpenDocs ChatGPT to PDF",
      description: "Free tool to save ChatGPT, Claude and Gemini answers as PDF or Word. No signup required.",
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Any",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      url: "https://opendocs.cc/tools/chatgpt-to-pdf",
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
        { "@type": "ListItem", position: 2, name: "ChatGPT to PDF", item: "https://opendocs.cc/tools/chatgpt-to-pdf" },
      ],
    },
  ],
};

export default async function ChatgptToPdfPage() {
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
          <h1 className="md-tool__title">ChatGPT to PDF</h1>
          <p className="md-tool__subtitle">
            Paste an answer from ChatGPT, Claude or Gemini and get a typeset PDF or Word file, with tables and code
            intact.
          </p>
        </section>

        <section className="md-tool__container md-tool__container--wide">
          <MarkdownConverter
            input="text"
            formats={["pdf", "docx"]}
            tool="chatgpt-to-pdf"
            textLabel="Paste the answer"
            placeholder={"Paste an answer here. Use the copy button under it in ChatGPT, Claude or Gemini to copy it as Markdown."}
            sample={AI_ANSWER_SAMPLE}
            fallbackFilename="ai-answer"
          />
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">How it works</h2>
          <div className="md-tool__steps">
            <div className="md-tool__step">
              <div className="md-tool__step-num">1</div>
              <h3 className="md-tool__step-title">Copy</h3>
              <p className="md-tool__step-desc">
                Click the copy button under the answer. It copies Markdown, not plain text.
              </p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">2</div>
              <h3 className="md-tool__step-title">Paste</h3>
              <p className="md-tool__step-desc">Paste it above. Add more answers or edit the text if you like.</p>
            </div>
            <div className="md-tool__step">
              <div className="md-tool__step-num">3</div>
              <h3 className="md-tool__step-title">Download</h3>
              <p className="md-tool__step-desc">Pick PDF or Word and convert. The file downloads right away.</p>
            </div>
          </div>
        </section>

        <section className="md-tool__section">
          <h2 className="md-tool__section-title">Why use this</h2>
          <ul className="md-tool__why-list">
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>It reads like a document.</strong> Real headings, tables that fit the page and highlighted
                code, not a screenshot of a chat window.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Word when you need to edit.</strong> The .docx uses Word&apos;s own heading and table styles,
                so it keeps its shape when someone changes it.
              </p>
            </li>
            <li className="md-tool__why-item">
              <span className="md-tool__why-bullet" aria-hidden="true" />
              <p className="md-tool__why-text">
                <strong>Works with any assistant.</strong> ChatGPT, Claude, Gemini, Copilot, Perplexity: anything that
                gives you Markdown.
              </p>
            </li>
          </ul>
        </section>

        <ToolAgentBlock format="pdf" source="chatgpt-to-pdf">
          If the answer comes from an agent like Claude Code, Cursor or Codex, it can make the PDF itself: it writes
          the Markdown, publishes it and hands you the link and the file.
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

        <ToolCrossLinks current="chatgpt-to-pdf" />

        <MarketingCta
          title="Let your agent publish for you"
          text="OpenDocs turns what your agent writes into a shareable page, with PDF and Word export included."
        />
      </main>
      <LandingFooter />
    </>
  );
}
