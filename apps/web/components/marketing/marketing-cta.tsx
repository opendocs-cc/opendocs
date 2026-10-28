import Link from "next/link";

import { CopyAgentPrompt } from "@/components/copy-agent-prompt";

type MarketingCtaProps = {
  title: string;
  text?: string;
};

/**
 * Closing call to action for marketing pages, matching the home page's
 * "Start with one prompt" block: the agent setup prompt as the primary
 * action and browser signup as the alternative.
 */
export function MarketingCta({ title, text }: MarketingCtaProps) {
  return (
    <section className="mx-auto w-full max-w-[760px] px-5 py-12 sm:px-6 md:py-16">
      <div className="rounded-[28px] bg-white p-7 ring-1 ring-zinc-900/[0.07] sm:p-10">
        <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-balance text-zinc-950 sm:text-[32px]">
          {title}
        </h2>
        {text ? (
          <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-pretty text-zinc-600">
            {text}
          </p>
        ) : null}
        <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
          <CopyAgentPrompt className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[#6B3FC9] px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(107,63,201,0.7)] transition hover:bg-[#5B33B0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25" />
          <Link
            href="/signup"
            className="text-[15px] font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
          >
            Sign up in the browser
          </Link>
        </div>
        <p className="mt-5 text-sm text-zinc-500">
          Free for up to 50 documents. No credit card.
        </p>
      </div>
    </section>
  );
}
