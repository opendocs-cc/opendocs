import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { EXAMPLE_PAGE_SIZE, LANDING_EXAMPLES } from "@/lib/landing-examples";

type ExamplePagesProps = {
  /** Example slugs to show, left to right (defaults to three presets). */
  slugs?: string[];
  caption?: string;
  /** "column" sits under a 760px article column; "page" aligns to max-w-6xl layouts. */
  width?: "column" | "page";
};

/**
 * A row of real exported first pages (converter output with three
 * branding presets), so marketing pages show the actual PDFs rather than
 * describing them.
 */
export function ExamplePages({
  slugs = ["investor-update", "field-study", "staff-handbook"],
  caption = "Real PDF exports from Markdown, each with a different preset and logo.",
  width = "column",
}: ExamplePagesProps) {
  const examples = slugs
    .map((slug) => LANDING_EXAMPLES.find((example) => example.slug === slug))
    .filter((example): example is (typeof LANDING_EXAMPLES)[number] => Boolean(example));

  return (
    <section
      className={`mx-auto w-full py-8 ${
        width === "page" ? "max-w-6xl px-5 sm:px-8" : "max-w-[1000px] px-5 sm:px-6"
      }`}
    >
      <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
        {examples.map((example, i) => (
          <a
            key={example.slug}
            href={`/examples/${example.slug}.pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className={`group block transition-transform duration-300 hover:-translate-y-1 ${
              i === 1 ? "sm:-translate-y-4 sm:hover:-translate-y-5" : ""
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/examples/${example.slug}.webp`}
              alt={`First page of "${example.title}", exported with the ${example.presetName} preset`}
              width={EXAMPLE_PAGE_SIZE.width}
              height={EXAMPLE_PAGE_SIZE.height}
              loading="lazy"
              decoding="async"
              className="w-full rounded-[4px] bg-white shadow-[0_30px_60px_-30px_rgba(38,24,72,0.45),0_0_0_1px_rgba(24,24,27,0.06)]"
            />
            <span className="mt-3 hidden items-center gap-2 text-sm text-zinc-500 sm:flex">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: example.brandColor }}
              />
              {example.presetName}, {example.font}
            </span>
          </a>
        ))}
      </div>
      <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-zinc-600">
        {caption}
        <Link
          href="/#examples"
          className="inline-flex items-center gap-1 font-medium text-zinc-900 underline-offset-4 hover:underline"
        >
          See the examples
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </p>
    </section>
  );
}
