"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ArticleTocItem = { id: string; text: string; level: number };

type ArticleTocProps = {
  items: ArticleTocItem[];
  /** "sidebar" for the sticky desktop column, "inline" for the collapsible mobile box. */
  variant: "sidebar" | "inline";
};

/** Header height plus breathing room; headings above this line count as "read". */
const ACTIVE_OFFSET = 112;

/**
 * Past this many entries the sidebar only lists the H3s of the section
 * being read; shorter contents fit and stay fully expanded.
 */
const COLLAPSE_FROM = 16;

/** Height of the fade at an edge of the sidebar list with more behind it. */
const FADE = 32;

type TocSection = { heading: ArticleTocItem | null; children: ArticleTocItem[] };

/** Groups each H2 with the H3s under it. H3s before the first H2 get a group of their own. */
function toSections(items: ArticleTocItem[]): TocSection[] {
  const sections: TocSection[] = [];
  for (const item of items) {
    if (item.level === 2 || sections.length === 0) {
      sections.push(item.level === 2 ? { heading: item, children: [] } : { heading: null, children: [item] });
    } else {
      sections[sections.length - 1].children.push(item);
    }
  }
  return sections;
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * "On this page" table of contents built from the version's stored
 * headings (H2 and H3). Links are plain `#id` anchors so they work
 * before hydration.
 *
 * The sidebar variant highlights the section in view and, for long
 * articles, behaves like a reading map rather than a full outline:
 *
 * - The list scrolls inside its sticky column with the scrollbar hidden;
 *   an edge fades out while there is more list behind it.
 * - The active entry is kept scrolled into view, unless the pointer is
 *   over the list (the reader is browsing it).
 * - Past COLLAPSE_FROM entries, only the active section's H3s show.
 * - Clicking an entry marks it active straight away and pauses the
 *   scroll spy until the smooth scroll settles, so sections the page
 *   scrolls past don't expand and collapse under the cursor.
 */
export function ArticleToc({ items, variant }: ArticleTocProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);
  const pointerInsideRef = useRef(false);
  // Set while a clicked entry's smooth scroll is running.
  const clickLockRef = useRef<{ id: string; timer: number } | null>(null);

  const sections = useMemo(() => toSections(items), [items]);
  const collapsible =
    variant === "sidebar" &&
    items.length >= COLLAPSE_FROM &&
    sections.some((section) => section.heading && section.children.length > 0);
  const activeSectionIndex = Math.max(
    0,
    sections.findIndex(
      (section) =>
        section.heading?.id === activeId ||
        section.children.some((child) => child.id === activeId),
    ),
  );

  // ---- Scroll spy.
  useEffect(() => {
    if (variant !== "sidebar" || items.length === 0) return;
    const headings = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (headings.length === 0) return;

    let frame = 0;
    const update = () => {
      frame = 0;
      if (clickLockRef.current) return;
      let current: string | null = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top - ACTIVE_OFFSET <= 0) {
          current = heading.id;
        } else {
          break;
        }
      }
      // At the very bottom the last short sections can never reach the
      // top, so treat "scrolled to the end" as the last heading.
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 4) {
        current = headings[headings.length - 1].id;
      }
      setActiveId(current);
    };
    // A clicked entry holds until the page stops scrolling: on
    // `scrollend` where the browser has it, else after a quiet beat.
    const hasScrollEnd = "onscrollend" in window;
    const release = () => {
      const lock = clickLockRef.current;
      if (!lock) return;
      window.clearTimeout(lock.timer);
      clickLockRef.current = null;
      update();
    };
    const onScroll = () => {
      const lock = clickLockRef.current;
      if (lock) {
        window.clearTimeout(lock.timer);
        lock.timer = hasScrollEnd
          ? window.setTimeout(release, 3000)
          : window.setTimeout(release, 150);
        return;
      }
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", release);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", release);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
      if (clickLockRef.current) window.clearTimeout(clickLockRef.current.timer);
    };
  }, [items, variant]);

  // ---- Edge fades: on whenever there is more list behind that edge.
  useEffect(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (!scroller || !list) return;
    const update = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      setEdges({ top: scroller.scrollTop > 1, bottom: scroller.scrollTop < max - 1 });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    // The list changes height as sections expand and collapse.
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    observer.observe(list);
    return () => {
      scroller.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [variant]);

  // ---- Keep the active entry in view. Runs again once an expanding
  // section has finished animating, since that moves the entry.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !activeId) return;
    const reveal = () => {
      if (pointerInsideRef.current) return;
      const link = scroller.querySelector<HTMLElement>(
        `a[href="#${CSS.escape(activeId)}"]`,
      );
      if (!link) return;
      const top =
        link.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top +
        scroller.scrollTop;
      const bottom = top + link.offsetHeight;
      const margin = FADE + 8;
      if (top >= scroller.scrollTop + margin && bottom <= scroller.scrollTop + scroller.clientHeight - margin) {
        return;
      }
      scroller.scrollTo({
        // Park it a third of the way down, so what comes next shows too.
        top: Math.max(0, top - scroller.clientHeight / 3),
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    };
    reveal();
    const timer = window.setTimeout(reveal, 320);
    return () => window.clearTimeout(timer);
  }, [activeId]);

  if (items.length < 2) return null;

  // `inActiveSection` lifts the H2 above an active H3 a shade, so the
  // reader sees which section they are in.
  const linkClass = (isActive: boolean, inActiveSection: boolean) =>
    `-ml-px block border-l py-1 pl-3 transition-colors ${
      isActive
        ? "border-zinc-900 font-medium text-zinc-950 dark:border-white dark:text-white"
        : `border-transparent hover:border-zinc-300 hover:text-zinc-900 dark:hover:border-zinc-600 dark:hover:text-zinc-100 ${
            inActiveSection
              ? "text-zinc-800 dark:text-zinc-200"
              : "text-zinc-500 dark:text-zinc-400"
          }`
    }`;

  const onEntryClick = (id: string) => {
    if (variant !== "sidebar") return;
    if (clickLockRef.current) window.clearTimeout(clickLockRef.current.timer);
    // Released by the scroll handler once scrolling settles; the timer
    // covers a click that doesn't scroll at all.
    clickLockRef.current = {
      id,
      timer: window.setTimeout(() => {
        clickLockRef.current = null;
      }, 1000),
    };
    setActiveId(id);
  };

  const entry = (item: ArticleTocItem, inActiveSection = false) => {
    const isActive = item.id === activeId;
    return (
      <a
        href={`#${item.id}`}
        aria-current={isActive ? "location" : undefined}
        onClick={() => onEntryClick(item.id)}
        className={linkClass(isActive, inActiveSection)}
      >
        {item.text}
      </a>
    );
  };

  const list = (
    <ol ref={listRef} className="flex flex-col gap-0.5 text-[13px] leading-snug">
      {sections.map((section, index) => {
        const expanded = !collapsible || index === activeSectionIndex;
        return (
          <li key={section.heading?.id ?? `section-${index}`}>
            {section.heading
              ? entry(section.heading, collapsible && index === activeSectionIndex)
              : null}
            {section.children.length > 0 ? (
              // Collapsing animates grid rows (0fr ↔ 1fr), which handles
              // any height. `inert` keeps hidden links out of the tab order.
              <div
                className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
                style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
                inert={!expanded}
              >
                <ol className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                  {section.children.map((child) => (
                    <li
                      key={child.id}
                      className={section.heading ? "pl-3 first:pt-0.5" : undefined}
                    >
                      {entry(child)}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );

  if (variant === "inline") {
    return (
      <details className="group mb-8 rounded-xl bg-zinc-50 ring-1 ring-zinc-900/[0.05] dark:bg-zinc-900/60 dark:ring-white/[0.06]">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-medium text-zinc-800 dark:text-zinc-200 [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown
            className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <nav aria-label="On this page" className="border-l border-zinc-200 mx-4 mb-4 dark:border-zinc-800">
          {list}
        </nav>
      </details>
    );
  }

  const mask = `linear-gradient(to bottom, ${edges.top ? "transparent" : "black"}, black ${FADE}px, black calc(100% - ${FADE}px), ${edges.bottom ? "transparent" : "black"})`;

  return (
    <nav aria-label="On this page">
      <p className="mb-3 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
        On this page
      </p>
      <div
        ref={scrollRef}
        onPointerEnter={() => {
          pointerInsideRef.current = true;
        }}
        onPointerLeave={() => {
          pointerInsideRef.current = false;
        }}
        style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="max-h-[calc(100vh-10rem)] overflow-y-auto overscroll-contain border-l border-zinc-200 [scrollbar-width:none] dark:border-zinc-800 [&::-webkit-scrollbar]:hidden"
      >
        {list}
      </div>
    </nav>
  );
}
