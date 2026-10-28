
import { MarketingShell } from "@/components/marketing-shell";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../../landing.css";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { ExamplePages } from "@/components/marketing/example-pages";

export const metadata = buildPageMetadata({
  title: "Turn Markdown into Client-Ready Reports",
  description:
    "Write your audit, analysis, or technical report in Markdown. Publish to a private workspace link. Export a branded PDF or DOCX. Built for agencies, consultants, and freelancers.",
  url: "https://opendocs.cc/use-cases/client-reports",
  socialTitle: "Client-Ready Reports | OpenDocs",
});

export default async function ClientReportsPage() {
  const session = await getServerSession();

  return (
    <MarketingShell isViewerSignedIn={Boolean(session)}>
      <section className="mk-hero">
        <span className="mk-hero__eyebrow">Use case</span>
        <h1 className="mk-hero__title">
          Turn technical Markdown into client-ready reports
        </h1>
        <p className="mk-hero__subtitle">
          Write the report once in Markdown. Publish to a private link
          only your client can see. Export a branded PDF or DOCX they
          can share internally. No Notion gymnastics, no Google Docs
          formatting nightmare.
        </p>
      </section>

      <ExamplePages
        slugs={["investor-update", "annual-letter", "field-study"]}
        caption="Client deliverables exported from Markdown, each in a different preset with the client's logo."
      />

      <section className="mk-section">
        <h2 className="mk-section__title">The agency workflow</h2>
        <div className="mk-section__body">
          <p>
            You're auditing a codebase, reviewing security posture,
            doing a tech-stack assessment, or writing a discovery
            report. The deliverable is a long-form document and the
            client wants something they can read on their phone, share
            with their CTO, and forward to their board.
          </p>
          <p>
            The usual options all force a rewrite step. Notion looks
            great but means re-formatting every code block. Google
            Docs strips your structure. PDFs are easy to send but a
            pain to update.
          </p>
          <p>
            With OpenDocs the whole thing comes down to three steps:
          </p>
        </div>
        <ul className="mk-bullets">
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>1. Write in Markdown.</strong> Use whichever
              editor you already like. Tables, code blocks, headings,
              all of it survives.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>2. Publish to a private workspace link.</strong>{" "}
              Restricted-email visibility means only the addresses you
              list can read it. The client opens the URL with no
              signup on their end.
            </p>
          </li>
          <li className="mk-bullets__item">
            <span className="mk-bullets__dot" aria-hidden="true" />
            <p className="mk-bullets__text">
              <strong>3. Export a branded PDF or DOCX.</strong> Custom
              footer with your agency name, your brand color on
              headings, your logo top-right. They get a polished
              attachment to forward internally.
            </p>
          </li>
        </ul>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">What an agency report looks like</h2>
        <div className="mk-section__body">
          <p>
            A typical client report has four parts:
          </p>
          <ul className="mk-bullets">
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Executive summary</strong>: three paragraphs
                a CEO can read.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Methodology</strong>: what you looked at, how
                you scored it.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Findings</strong>: itemized, with severity,
                evidence, and recommendation.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Roadmap</strong>: what you'd do next, in
                rough priority order.
              </p>
            </li>
          </ul>
          <p>
            All four map cleanly to Markdown headings, lists, and
            tables. Start with a blank file and you'll have something
            shippable in under an hour.
          </p>
        </div>
      </section>

      <section className="mk-section">
        <h2 className="mk-section__title">Branding the export</h2>
        <div className="mk-section__body">
          <p>
            On the Pro plan, every PDF and DOCX exports with your
            branding instead of ours:
          </p>
          <ul className="mk-bullets">
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Custom footer.</strong> Your agency name,
                tagline, link.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Brand color.</strong> Applied to headings,
                links, and accents throughout.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Logo.</strong> Top-right of every exported
                page.
              </p>
            </li>
            <li className="mk-bullets__item">
              <span className="mk-bullets__dot" aria-hidden="true" />
              <p className="mk-bullets__text">
                <strong>Custom font.</strong> Pick from the export
                font library so the doc matches your brand.
              </p>
            </li>
          </ul>
        </div>
      </section>

      <MarketingCta title={"Skip the formatting tax. Write the report, publish, send."} text={"Brand your exports free. Pro adds your own footer."} />
    </MarketingShell>
  );
}
