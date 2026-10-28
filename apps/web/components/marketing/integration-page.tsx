import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

import { CopyAgentPrompt } from "@/components/copy-agent-prompt";
import { CommandRow } from "@/components/marketing/command-row";
import { ExamplePages } from "@/components/marketing/example-pages";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { AGENT_LOGOS } from "@/lib/agent-logos";
import { INTEGRATIONS, type Integration } from "@/lib/integrations";
import { MCP_PAGE_PATH } from "@/lib/mcp";

const INSTALL_SKILL = "npx skills add opendocs-cc/skills --skill opendocs -g -y";
const INSTALL_SCRIPT = "curl -fsSL https://opendocs.cc/install.sh | bash";
const LOGIN = "opendocs login --email you@example.com";

function AgentMark({ integration, size = "lg" }: { integration: Integration; size?: "lg" | "sm" }) {
  const logo = AGENT_LOGOS.find((item) => item.slug === integration.logoSlug);
  const box = size === "lg" ? "h-14 w-14 rounded-2xl" : "h-9 w-9 rounded-xl";
  const icon = size === "lg" ? "h-7 w-7" : "h-[18px] w-[18px]";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center bg-white text-zinc-800 ring-1 ring-zinc-900/[0.08] ${box}`}
    >
      {logo ? (
        <svg viewBox="0 0 24 24" className={`${icon} fill-current`}>
          <path d={logo.path} />
        </svg>
      ) : (
        <span className={size === "lg" ? "text-xl font-semibold" : "text-sm font-semibold"}>
          {integration.name.charAt(0)}
        </span>
      )}
    </span>
  );
}

/**
 * Shared layout for /integrations/<slug>: what the agent does with
 * OpenDocs, a real request and CLI output, setup in three moves, real
 * branded exports, the other integrations and the closing prompt CTA.
 */
export function IntegrationPage({ integration }: { integration: Integration }) {
  const others = INTEGRATIONS.filter((item) => item.slug !== integration.slug);
  const docsHref = `https://docs.opendocs.cc/integrations/${integration.slug}`;

  return (
    <main className="mk-page">
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-12 pt-32 sm:px-8 md:pt-36 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14">
        <div>
          <AgentMark integration={integration} />
          <h1 className="mt-6 text-[36px] font-semibold leading-[1.06] tracking-[-0.035em] text-balance text-zinc-950 sm:text-[48px]">
            Publish Markdown from {integration.name}
          </h1>
          <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-pretty text-zinc-600">
            {integration.intro}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
            <CopyAgentPrompt className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[#6B3FC9] px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(107,63,201,0.7)] transition hover:bg-[#5B33B0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25" />
            <a
              href={docsHref}
              className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-950 hover:underline"
            >
              Setup guide
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div>
          <p className="border-l-2 border-[#6B3FC9] pl-4 text-lg leading-snug text-zinc-900">
            &ldquo;{integration.request}&rdquo;
          </p>
          <pre className="mt-6 whitespace-pre-wrap rounded-2xl bg-[#17151c] p-6 font-mono text-[13px] leading-[1.8] text-zinc-300 [overflow-wrap:anywhere] shadow-[0_30px_60px_-30px_rgba(23,21,28,0.6)] sm:p-7">
            <code>
              <span className="text-zinc-500">$ </span>
              <span className="text-white">{integration.command}</span>
              {"\n"}
              <span className="text-emerald-400">✔</span> Published successfully
              {"\n"}
              {"  "}URL: <span className="text-[#C4B3F5]">opendocs.cc/{integration.resultPath}</span>
            </code>
          </pre>
        </div>
      </section>

      {/* Setup */}
      <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
        <h2 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 md:text-[36px]">
          Set up in a minute
        </h2>
        <ol className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <li className="flex flex-col rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F4F0FD] text-sm font-semibold text-[#5B33B0]">
              1
            </span>
            <h3 className="mt-5 text-lg font-semibold text-zinc-950">
              Give {integration.name} the skill
            </h3>
            <p className="mt-2 leading-relaxed text-zinc-600">
              The skill teaches your agent to publish, organize and export. No
              Node.js? The second command installs a bash version.
            </p>
            <div className="mt-5 space-y-2">
              <CommandRow command={INSTALL_SKILL} />
              <CommandRow command={INSTALL_SCRIPT} />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
              A PromptScript error at the end of the first command is a known installer bug. The
              skill is still installed.
            </p>
          </li>
          <li className="flex flex-col rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#F4F0FD] text-sm font-semibold text-[#5B33B0]">
              2
            </span>
            <h3 className="mt-5 text-lg font-semibold text-zinc-950">Sign in with an emailed code</h3>
            <p className="mt-2 leading-relaxed text-zinc-600">
              No browser needed: a 6-digit code arrives by email. New accounts get a workspace
              right away. {integration.whereItRuns}
            </p>
            <div className="mt-5">
              <CommandRow command={LOGIN} />
            </div>
          </li>
          <li className="flex flex-col rounded-3xl bg-[#F4F0FD] p-7">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-[#5B33B0]">
              3
            </span>
            <h3 className="mt-5 text-lg font-semibold text-zinc-950">{integration.askTitle}</h3>
            <p className="mt-2 leading-relaxed text-zinc-700">{integration.askDescription}</p>
            <p className="mt-5 text-[15px] leading-relaxed text-zinc-600">
              Or skip steps 1 and 2: copy the setup prompt above and paste it into{" "}
              {integration.name}.
            </p>
          </li>
        </ol>
        {integration.mcpTab ? (
          <div className="mt-4 flex flex-col gap-3 rounded-3xl bg-white p-6 ring-1 ring-zinc-900/[0.06] sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:px-7">
            <p className="max-w-[62ch] leading-relaxed text-zinc-600">
              <span className="font-semibold text-zinc-950">Prefer MCP?</span> Connect OpenDocs to{" "}
              {integration.name} over MCP instead: nothing to install, and you sign in with your OpenDocs
              account. The skill is still better for local files and images.
            </p>
            {/* A plain link: the /mcp tabs read the hash when the page loads. */}
            <a
              href={`${MCP_PAGE_PATH}#${integration.mcpTab}`}
              className="inline-flex flex-none items-center gap-1 text-[15px] font-medium text-[#5B33B0] underline-offset-4 hover:underline"
            >
              Connect over MCP
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        ) : null}
      </section>

      {/* Real exports */}
      <section className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-8">
        <h2 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 md:text-[36px]">
          Ask for a PDF, get it on brand
        </h2>
        <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-zinc-600">
          {integration.name} hands OpenDocs the Markdown; OpenDocs does the typesetting with your
          workspace&apos;s colors, font and logo, so the agent spends its tokens on the writing.
        </p>
      </section>
      <ExamplePages width="page" caption="Real exports from Markdown, each with a different preset and logo." />

      {/* Other integrations */}
      <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <h2 className="text-lg font-semibold text-zinc-950">Works the same with</h2>
        <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {others.map((item) => (
            <li key={item.slug}>
              <Link
                href={`/integrations/${item.slug}`}
                className="flex items-center gap-3 rounded-2xl bg-white p-3 text-sm font-medium text-zinc-800 ring-1 ring-zinc-900/[0.06] transition hover:-translate-y-0.5 hover:ring-zinc-900/15"
              >
                <AgentMark integration={item} size="sm" />
                <span className="truncate">{item.name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <MarketingCta title={integration.ctaTitle} text={integration.ctaText} />
    </main>
  );
}
