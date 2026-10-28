"use client";

import { useEffect, useState } from "react";

type TocSection = { id: string; title: string; number: number };

/**
 * Table of contents for a legal document. On wide screens it sits in the
 * sticky sidebar and marks the section being read; on phones it folds
 * into an "On this page" disclosure above the text.
 */
export function LegalToc({ sections }: { sections: TocSection[] }) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    const elements = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    // The active section is the last one whose top has passed a line a
    // little below the fixed nav.
    const update = () => {
      const line = 140;
      let current = elements[0].id;
      for (const el of elements) {
        if (el.getBoundingClientRect().top - line <= 0) current = el.id;
        else break;
      }
      setActive(current);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sections]);

  const list = (
    <ol className="legal-toc__list">
      {sections.map((s) => (
        <li key={s.id}>
          <a
            href={`#${s.id}`}
            className="legal-toc__link"
            aria-current={active === s.id ? "location" : undefined}
          >
            <span className="legal-toc__number">{s.number}</span>
            <span>{s.title}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <>
      <nav className="legal-toc legal-toc--sidebar" aria-label="On this page">
        <p className="legal-toc__heading">On this page</p>
        {list}
      </nav>
      <details className="legal-toc legal-toc--inline">
        <summary className="legal-toc__summary">On this page</summary>
        <nav aria-label="On this page">{list}</nav>
      </details>
    </>
  );
}
