"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Width of the fade at an edge that has more tabs behind it. */
const FADE = 28;

/**
 * Horizontally scrolling project tab strip. Scrolls the active tab into
 * view on load (picking project 12 from the picker lands with its tab
 * visible, not off to the right) and fades whichever edge has more tabs
 * hidden behind it.
 */
export function ProjectTabsNav({ children }: { children: ReactNode }) {
  const navRef = useRef<HTMLElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active && nav.scrollWidth > nav.clientWidth) {
      const target = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
      nav.scrollLeft = Math.max(0, target);
    }

    const update = () => {
      const max = nav.scrollWidth - nav.clientWidth;
      setEdges({ start: nav.scrollLeft > 1, end: nav.scrollLeft < max - 1 });
    };
    update();
    nav.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      nav.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const mask = `linear-gradient(to right, ${edges.start ? "transparent" : "black"}, black ${FADE}px, black calc(100% - ${FADE}px), ${edges.end ? "transparent" : "black"})`;

  return (
    <nav
      ref={navRef}
      aria-label="Projects"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
      className="relative -mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {children}
    </nav>
  );
}
