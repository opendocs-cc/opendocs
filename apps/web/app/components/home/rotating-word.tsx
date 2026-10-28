"use client";

import { useEffect, useState } from "react";

/**
 * The hero's cycling document type ("branded reports / proposals / …").
 * All words share one grid cell so the slot is as wide as the longest word
 * and the headline never reflows. Stays on the first word when the visitor
 * prefers reduced motion; screen readers get the full list once.
 */
export function RotatingWord({ words, intervalMs = 2400 }: { words: string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  const previous = (index - 1 + words.length) % words.length;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % words.length), intervalMs);
    return () => window.clearInterval(id);
  }, [words.length, intervalMs]);

  return (
    <span className="relative inline-grid align-baseline">
      <span className="sr-only">{words.join(", ")}</span>
      {words.map((word, i) => (
        <span
          key={word}
          aria-hidden="true"
          // The outgoing word lifts away first; the incoming one rises in
          // just after, so the two never overlap at full strength.
          className={`col-start-1 row-start-1 whitespace-nowrap text-[#6B3FC9] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
            i === index
              ? "translate-y-0 opacity-100 transition-[opacity,translate] delay-150 duration-500"
              : i === previous
                ? "-translate-y-[0.3em] opacity-0 transition-[opacity,translate] duration-300"
                : "translate-y-[0.3em] opacity-0 transition-none"
          }`}
        >
          {word}
        </span>
      ))}
    </span>
  );
}
