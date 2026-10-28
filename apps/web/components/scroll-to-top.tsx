"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

type ScrollToTopProps = {
  /**
   * How far the user must scroll (in px) before the button fades in.
   * 400 lines up with "past the top hero" on the article page and the
   * workspace profile; tune up if we find it shows too eagerly.
   */
  threshold?: number;
};

/**
 * Floating "back to top" button that fades in once the user has scrolled
 * past `threshold` and smoothly scrolls to the top when clicked. Pinned
 * to the bottom-right viewport corner, staying above any floating
 * elements via `z-40`.
 *
 * Uses `requestAnimationFrame` throttling so the scroll listener doesn't
 * fire on every pixel — cheap enough for long blog posts where scroll
 * events otherwise stack up and cost battery on mobile.
 */
export function ScrollToTop({ threshold = 400 }: ScrollToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        setVisible(window.scrollY > threshold);
        ticking = false;
      });
    };
    // Run once on mount so a back-navigation mid-page shows the button
    // without requiring a synthetic scroll event.
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  const handleClick = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Scroll to top"
      // `pointer-events-none` when hidden so the button can't steal
      // clicks while it's invisibly parked at the corner. The parent
      // `z-40` keeps it above article content but below any modal.
      className={`fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white text-zinc-600 shadow-lg shadow-zinc-800/10 ring-1 ring-zinc-900/5 backdrop-blur transition-all duration-300 hover:text-primary hover:shadow-xl hover:shadow-zinc-800/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 dark:bg-zinc-900 dark:text-zinc-300 dark:shadow-black/25 dark:ring-white/10 dark:hover:text-violet-300 ${
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0"
      }`}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2} />
    </button>
  );
}
