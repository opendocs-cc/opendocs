"use client";

import { useEffect, useRef } from "react";

// Lucide's "copy" and "check" icons as markup: the buttons are added to
// server-rendered HTML, outside React.
const COPY_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
const CHECK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

/**
 * The rendered Markdown of an article, with a copy button on every code
 * block (bottom-right, shown on hover; styles in opendocs-markdown.css).
 * The button holds no text nodes, so the commenting layer's text walk and
 * comment anchors are unaffected.
 */
export function ArticleBody({ html }: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const timers: number[] = [];
    const buttons: HTMLButtonElement[] = [];

    for (const pre of Array.from(root.querySelectorAll("pre"))) {
      // Highlighted blocks come wrapped in a <figure>; plain ones get a
      // wrapper so the button stays put when the code scrolls sideways.
      let container = pre.parentElement;
      if (!container?.matches("figure[data-rehype-pretty-code-figure], .od-code-block")) {
        const wrapper = document.createElement("div");
        wrapper.className = "od-code-block";
        pre.replaceWith(wrapper);
        wrapper.append(pre);
        container = wrapper;
      }
      if (container.querySelector(":scope > .od-code-copy")) continue;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "od-code-copy";
      button.setAttribute("aria-label", "Copy code");
      button.title = "Copy code";
      button.innerHTML = COPY_ICON;
      button.addEventListener("click", async () => {
        const code = (pre.querySelector("code") ?? pre).textContent ?? "";
        try {
          await navigator.clipboard.writeText(code.replace(/\n$/, ""));
        } catch {
          return;
        }
        button.innerHTML = CHECK_ICON;
        button.dataset.copied = "true";
        button.setAttribute("aria-label", "Copied");
        timers.push(
          window.setTimeout(() => {
            button.innerHTML = COPY_ICON;
            delete button.dataset.copied;
            button.setAttribute("aria-label", "Copy code");
          }, 2000),
        );
      });
      container.append(button);
      buttons.push(button);
    }

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      buttons.forEach((b) => b.remove());
    };
  }, [html]);

  return <div ref={ref} dangerouslySetInnerHTML={{ __html: html }} />;
}
