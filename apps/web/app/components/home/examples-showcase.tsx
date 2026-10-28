"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";

import { EXAMPLE_PAGE_SIZE, LANDING_EXAMPLES } from "@/lib/landing-examples";

/**
 * Tabbed gallery of real exported documents: what you asked for, the
 * Markdown your agent wrote, and the branded first page OpenDocs produced.
 * Every page image stays mounted (stacked) so switching tabs is instant
 * and only cross-fades.
 */
export function ExamplesShowcase() {
  const [active, setActive] = useState(0);
  const example = LANDING_EXAMPLES[active];

  return (
    <div>
      <div
        role="tablist"
        aria-label="Example documents"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {LANDING_EXAMPLES.map((item, i) => {
          const selected = i === active;
          return (
            <button
              key={item.slug}
              type="button"
              role="tab"
              id={`example-tab-${item.slug}`}
              aria-selected={selected}
              aria-controls="example-panel"
              onClick={() => setActive(i)}
              className={`inline-flex flex-none items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7F56D9]/50 active:scale-[0.98] ${
                selected
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 ring-1 ring-zinc-900/10 hover:text-zinc-900 hover:ring-zinc-900/20"
              }`}
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full ring-1 ring-white/40"
                style={{ backgroundColor: item.brandColor }}
              />
              {item.label}
            </button>
          );
        })}
      </div>

      <div
        id="example-panel"
        role="tabpanel"
        aria-labelledby={`example-tab-${example.slug}`}
        className="mt-8 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14"
      >
        <div className="order-2 flex flex-col gap-6 lg:order-1">
          <div>
            <p className="text-sm font-medium text-zinc-500">You ask your agent</p>
            <p className="mt-2 text-lg leading-snug text-zinc-900 text-pretty">
              &ldquo;{example.prompt}&rdquo;
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">It writes Markdown</p>
            <pre className="mt-2 overflow-x-auto rounded-2xl bg-white p-5 font-mono text-[12.5px] leading-relaxed text-zinc-700 ring-1 ring-zinc-900/[0.07]">
              <code>{example.markdown}</code>
            </pre>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-500">OpenDocs exports it with your brand</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-zinc-700">
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-[5px]"
                  style={{ backgroundColor: example.brandColor }}
                />
                {example.presetName} preset
              </span>
              <span>{example.font}</span>
              <span>{example.organization} logo and footer</span>
            </div>
          </div>
        </div>

        <figure className="order-1 lg:order-2">
          <div
            className="relative mx-auto w-full max-w-[460px]"
            style={{ aspectRatio: `${EXAMPLE_PAGE_SIZE.width} / ${EXAMPLE_PAGE_SIZE.height}` }}
          >
            {LANDING_EXAMPLES.map((item, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={item.slug}
                src={`/examples/${item.slug}.webp`}
                alt={i === active ? `First page of "${item.title}", exported as a PDF with the ${item.presetName} preset` : ""}
                aria-hidden={i === active ? undefined : true}
                width={EXAMPLE_PAGE_SIZE.width}
                height={EXAMPLE_PAGE_SIZE.height}
                loading="lazy"
                decoding="async"
                className={`absolute inset-0 h-full w-full rounded-md bg-white shadow-[0_40px_80px_-30px_rgba(38,24,72,0.35),0_0_0_1px_rgba(24,24,27,0.06)] transition-opacity duration-300 motion-reduce:transition-none ${
                  i === active ? "opacity-100" : "opacity-0"
                }`}
              />
            ))}
          </div>
          <figcaption className="mx-auto mt-4 flex max-w-[460px] items-center justify-between gap-3 text-sm text-zinc-500">
            <span className="min-w-0">Sample: {example.organization}</span>
            <a
              href={`/examples/${example.slug}.pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-none items-center gap-1 font-medium text-zinc-900 underline-offset-4 hover:underline"
            >
              Open the PDF
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
