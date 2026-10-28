import Link from "next/link";
import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { LegalToc } from "@/components/legal/legal-toc";
import { getServerSession } from "@/lib/auth/session";
import { endSentence, legalEntity, legalEntityWithRegistration } from "@/lib/legal-entity";

import "@/app/landing.css";
import "./legal.css";

const DOCUMENTS = [
  { id: "terms", label: "Terms of Service", href: "/terms" },
  { id: "privacy", label: "Privacy Policy", href: "/privacy" },
  { id: "refunds", label: "Refund Policy", href: "/refund-policy" },
] as const;

type LegalSectionProps = {
  id: string;
  title: string;
  /** Set by LegalPage from the section's position. */
  number?: number;
  children: ReactNode;
};

/** One numbered section of a legal document. Its number and table-of-contents entry come from LegalPage. */
export function LegalSection({ id, title, number, children }: LegalSectionProps) {
  return (
    <section id={id} className="legal-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="legal-section__title">
        {number ? <span className="legal-section__number">{number}.</span> : null}
        {title}
      </h2>
      {children}
    </section>
  );
}

function isSection(node: ReactNode): node is ReactElement<LegalSectionProps> {
  return isValidElement(node) && node.type === LegalSection;
}

/**
 * Shared layout for Terms, Privacy and Refund Policy: the marketing nav and
 * footer, a header that links the three documents, a sticky table of
 * contents built from the LegalSection children, and a readable body column.
 */
export async function LegalPage({
  document,
  title,
  summary,
  effective,
  updated,
  children,
}: {
  document: (typeof DOCUMENTS)[number]["id"];
  title: string;
  summary: string;
  effective: string;
  updated?: string;
  children: ReactNode;
}) {
  const entity = legalEntity();
  const session = await getServerSession();

  let number = 0;
  const sections: { id: string; title: string; number: number }[] = [];
  const body = Children.map(children, (child) => {
    if (!isSection(child)) return child;
    number += 1;
    sections.push({ id: child.props.id, title: child.props.title, number });
    return cloneElement(child, { number });
  });

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />

      <main className="mk-page">
        <div className="legal">
          <header className="legal-header">
            <p className="legal-header__eyebrow">Legal</p>
            <h1 className="legal-header__title">{title}</h1>
            <p className="legal-header__summary">{summary}</p>
            <p className="legal-header__dates">
              <span>Effective {effective}</span>
              {updated ? <span>Last updated {updated}</span> : null}
            </p>
            <nav className="legal-docs" aria-label="Legal documents">
              {DOCUMENTS.map((doc) => (
                <Link
                  key={doc.id}
                  href={doc.href}
                  className="legal-docs__link"
                  aria-current={doc.id === document ? "page" : undefined}
                >
                  {doc.label}
                </Link>
              ))}
            </nav>
          </header>

          <div className="legal-grid">
            <aside className="legal-aside">
              <LegalToc sections={sections} />
            </aside>

            <article className="legal-body">
              {body}
              <footer className="legal-contact">
                <p>
                  Questions about this policy? Email{" "}
                  <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>.
                </p>
                {entity.configured ? (
                  <p>
                    OpenDocs is operated by{" "}
                    {endSentence(`${legalEntityWithRegistration(entity)}${entity.country ? `, ${entity.country}` : ""}`)}
                  </p>
                ) : null}
              </footer>
            </article>
          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
