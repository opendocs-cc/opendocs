"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem = { id: string; label: string; content: ReactNode };

/**
 * Tabs for marketing pages, following the WAI-ARIA tabs pattern with
 * automatic activation: Left and Right move between tabs, Home and End jump
 * to the ends, and only the selected tab is in the Tab order. Every panel
 * stays in the HTML (inactive ones are `hidden`), so crawlers and readers
 * without JavaScript get all of it.
 *
 * A URL hash naming a tab (/mcp#chatgpt) opens that tab and scrolls to it,
 * and choosing a tab updates the hash so the link can be shared.
 */
export function Tabs({
  label,
  items,
  className = "",
}: {
  label: string;
  items: readonly TabItem[];
  className?: string;
}) {
  const [active, setActive] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const ids = items.map((item) => item.id).join(" ");

  useEffect(() => {
    const tabIds = ids.split(" ");
    const openFromHash = (focus: boolean) => {
      const index = tabIds.indexOf(decodeURIComponent(window.location.hash.slice(1)));
      if (index < 0) return false;
      setActive(index);
      rootRef.current?.scrollIntoView({ block: "start" });
      // After an in-page link (#codex), keep keyboard focus out of the
      // panel that just closed.
      if (focus) tabRefs.current[index]?.focus({ preventScroll: true });
      return true;
    };
    const onHashChange = () => openFromHash(true);
    // A client-side navigation may update the URL just after this mounts,
    // so look once more on the next frame.
    const frame = openFromHash(false) ? 0 : window.requestAnimationFrame(() => openFromHash(false));
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [ids]);

  const select = (index: number) => {
    setActive(index);
    window.history.replaceState(null, "", `#${items[index].id}`);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : -1;
    if (next < 0) return;
    event.preventDefault();
    select(next);
    tabRefs.current[next]?.focus();
  };

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  return (
    <div ref={rootRef} className={`scroll-mt-28 ${className}`}>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-2 text-sm font-medium">
        {items.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[i] = node;
              }}
              type="button"
              role="tab"
              id={tabId(item.id)}
              aria-selected={selected}
              aria-controls={panelId(item.id)}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(event) => onKeyDown(event, i)}
              className={`inline-flex flex-none items-center rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F56D9]/50 active:scale-[0.98] ${
                selected
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 ring-1 ring-zinc-900/10 hover:text-zinc-900 hover:ring-zinc-900/20"
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {items.map((item, i) => (
        <div
          key={item.id}
          role="tabpanel"
          id={panelId(item.id)}
          aria-labelledby={tabId(item.id)}
          tabIndex={0}
          hidden={i !== active}
          className="mt-8 rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F56D9]/40"
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
