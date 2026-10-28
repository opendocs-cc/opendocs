import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Coffee, LockOpen, RefreshCw, Server, Terminal } from "lucide-react";

import { CopyAgentPrompt } from "@/components/copy-agent-prompt";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { AGENT_LOGOS } from "@/lib/agent-logos";
import { getServerSession } from "@/lib/auth/session";
import { BRANDING_PRESETS } from "@/lib/branding-presets";
import { EXAMPLE_PAGE_SIZE, LANDING_EXAMPLES } from "@/lib/landing-examples";
import { buildPageMetadata } from "@/lib/metadata";
import { SELF_HOSTING_GUIDE_URL, SOURCE_REPO_URL, TIP_JAR_URL } from "@/lib/source-code";
import { CopyButton } from "./components/copy-button";
import { ExamplesShowcase } from "./components/home/examples-showcase";
import { RotatingWord } from "./components/home/rotating-word";
import "./landing.css";

export const metadata: Metadata = buildPageMetadata({
  // Homepage uses an absolute title so we don't double-suffix with the
  // site name via the root layout's "%s · OpenDocs" template.
  title: { absolute: "Branded documents from your agent's Markdown | OpenDocs" },
  description:
    "OpenDocs turns Markdown into organized, shareable links and on-brand PDF and Word files. Your agent handles it in one command.",
  socialTitle: "OpenDocs: branded documents from your agent's Markdown",
});

const HERO_WORDS = ["reports", "proposals", "handbooks", "specs", "memos"];

// Hero fan: three real exports, back to front.
const HERO_PAGES = [
  { slug: "annual-letter", className: "left-[2%] top-[9%] -rotate-[7deg]" },
  { slug: "staff-handbook", className: "right-[0%] top-[6%] rotate-[6deg]" },
  { slug: "investor-update", className: "left-1/2 top-0 -translate-x-1/2" },
] as const;

const INSTALL_SKILL = "npx skills add opendocs-cc/skills --skill opendocs -g -y";
const INSTALL_SCRIPT = "curl -fsSL https://opendocs.cc/install.sh | bash";

const SELF_HOST_POINTS = [
  { icon: LockOpen, text: "Every feature for every account, with billing off" },
  { icon: Terminal, text: "The same CLI, agent skill and MCP server, on your domain" },
  { icon: Server, text: "Your server, your database, your storage" },
  { icon: RefreshCw, text: "Updates are a git pull and a rebuild" },
];

const FAQ = [
  {
    q: "What is OpenDocs?",
    a: "A home for the Markdown your agent writes. It publishes .md files to organized, shareable links and exports branded PDF and Word files from the same source.",
  },
  {
    q: "Which agents does it work with?",
    a: "Any agent that can run a command or make an HTTP request: Claude Code, Codex, Cursor, Copilot, Gemini CLI, Cline, OpenClaw and others. There's a skill, a CLI, a REST API and a bash client that needs no Node.js.",
  },
  {
    q: "Can I use it from Claude or ChatGPT?",
    a: "Yes. Add the OpenDocs MCP server in Claude (web, desktop and mobile), or install OpenDocs.cc from ChatGPT's plugin directory. Sign in with your OpenDocs account, then ask in plain words. It works on every plan, including Free. The steps for each app are at opendocs.cc/mcp.",
  },
  {
    q: "Do I need an account?",
    a: "To keep your documents, yes, and it takes a minute: your agent signs you up with a code sent to your email, right from the terminal. It's free for up to 50 documents. For a quick throwaway link, it can also publish one that lasts 24 hours without an account.",
  },
  {
    q: "Who can see my documents?",
    a: "Your workspace, by default. Keep a document private, share it with specific people or a whole email domain, or make it public when you choose.",
  },
  {
    q: "Can I use my own branding?",
    a: "Yes, on every plan. Pick a preset or set your brand color, font and logo, in the dashboard or by asking your agent. It will check with you before changing anything. Pro and Team also swap the \"Made with OpenDocs\" footer for your own.",
  },
  {
    q: "What does it cost?",
    a: "Free for one workspace with up to 50 documents. Free includes export branding (your logo, color and font). Pro is $8 a month with unlimited documents, Word export and your own export footer. Team is $4 per member a month.",
  },
];

function SectionHeading({ title, body }: { title: string; body?: string }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance text-zinc-950 md:text-[40px]">
        {title}
      </h2>
      {body ? (
        <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-pretty text-zinc-600">{body}</p>
      ) : null}
    </div>
  );
}

function AgentPrompt({ children }: { children: string }) {
  return (
    <p className="mt-5 w-fit max-w-full rounded-lg bg-white/80 px-3 py-1.5 font-mono text-[12.5px] leading-relaxed text-zinc-700 ring-1 ring-zinc-900/[0.07]">
      &ldquo;{children}&rdquo;
    </p>
  );
}

export default async function HomePage() {
  // Server-side session read so the nav can show "Sign out" / "Go to
  // Dashboard" for logged-in visitors. Bots don't carry cookies, so this
  // always resolves to `null` for crawlers and the signed-out HTML stays
  // canonical for SEO.
  const session = await getServerSession();

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />

      <main className="lp-main overflow-x-clip">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-14 px-5 pb-16 pt-6 sm:px-8 md:pt-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-10 lg:pb-24">
          <div>
            <a
              href="#self-host"
              className="mb-6 inline-flex items-center gap-2 rounded-full bg-white py-1.5 pl-2.5 pr-3.5 text-[13px] font-medium text-zinc-700 ring-1 ring-zinc-900/[0.08] transition hover:text-zinc-950 hover:ring-zinc-900/20"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/github.svg" alt="" width={16} height={16} className="opacity-80" />
              The code is on GitHub. Host it yourself.
              <ArrowRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            </a>
            <h1 className="text-[34px] font-semibold leading-[1.08] min-[400px]:text-[38px] tracking-[-0.035em] text-zinc-950 sm:text-[56px] lg:text-[54px] xl:text-[60px]">
              <span className="block">
                Branded <RotatingWord words={HERO_WORDS} />
              </span>
              <span className="block">from your agent</span>
            </h1>
            <p className="mt-6 max-w-[34rem] text-lg leading-relaxed text-pretty text-zinc-600">
              Your agent writes the Markdown. OpenDocs files it in the right project, shares it as a
              link and exports on-brand PDF and Word files.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <CopyAgentPrompt className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[#6B3FC9] px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(107,63,201,0.7)] transition hover:bg-[#5B33B0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25" />
              <a
                href="#examples"
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-950 hover:underline"
              >
                See example documents
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>

          <div
            aria-hidden="true"
            className="relative mx-auto h-[330px] w-full max-w-[400px] sm:h-[460px] sm:max-w-[520px] lg:h-[520px]"
          >
            {HERO_PAGES.map((page, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={page.slug}
                src={`/examples/${page.slug}.webp`}
                alt=""
                width={EXAMPLE_PAGE_SIZE.width}
                height={EXAMPLE_PAGE_SIZE.height}
                fetchPriority={i === HERO_PAGES.length - 1 ? "high" : "auto"}
                decoding="async"
                className={`lp-home-page absolute w-[58%] rounded-[4px] bg-white shadow-[0_40px_70px_-30px_rgba(38,24,72,0.45),0_0_0_1px_rgba(24,24,27,0.06)] ${page.className}`}
                style={{ animationDelay: `${i * 90}ms` }}
              />
            ))}
          </div>
        </section>

        {/* Agents */}
        <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
          <div className="flex flex-col gap-6 border-y border-zinc-200/80 py-8 md:flex-row md:items-center md:justify-between">
            <p className="max-w-xs text-[15px] leading-snug text-zinc-600">
              Works with Claude Code, Codex, Cursor and any agent that can run a command.
            </p>
            <ul className="flex flex-wrap items-center gap-x-8 gap-y-5 text-zinc-400">
              {AGENT_LOGOS.map((logo) => (
                <li key={logo.slug}>
                  <svg
                    role="img"
                    viewBox="0 0 24 24"
                    className="h-6 w-6 fill-current transition-colors hover:text-zinc-700"
                  >
                    <title>{logo.title}</title>
                    <path d={logo.path} />
                  </svg>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* One prompt in, link and PDF out */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <SectionHeading
              title="Ask once. Get a link and a PDF."
              body="Your agent writes the Markdown, publishes it to the right project and exports a branded file. Your team gets the link, your client gets the PDF."
            />
            <p className="mt-8 border-l-2 border-[#6B3FC9] pl-4 text-lg leading-snug text-zinc-900">
              &ldquo;Publish the Q3 investor update to the Investors project and send me the
              PDF.&rdquo;
            </p>
          </div>
          <pre className="overflow-x-auto rounded-2xl bg-[#17151c] p-6 font-mono text-[13px] leading-[1.8] text-zinc-300 shadow-[0_30px_60px_-30px_rgba(23,21,28,0.6)] sm:p-8">
            <code>
              <span className="text-zinc-500">$ </span>
              <span className="text-white">opendocs publish q3-update.md --project Investors --export pdf</span>
              {"\n"}
              <span className="text-emerald-400">✔</span> Published successfully
              {"\n"}
              {"  "}URL: <span className="text-[#C4B3F5]">opendocs.cc/halvard/projects/investors/q3-investor-update</span>
              {"\n"}
              <span className="text-emerald-400">✔</span> Exported to q3-update.pdf
            </code>
          </pre>
        </section>

        {/* Examples */}
        <section id="examples" className="scroll-mt-24 bg-white py-20 md:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <SectionHeading
              title="Your brand on every document"
              body="These are real exports from Markdown, each with a different preset and logo. Set your colors, font, logo and footer once and every PDF and Word file follows them."
            />
            <div className="mt-12">
              <ExamplesShowcase />
            </div>
          </div>
        </section>

        {/* Why OpenDocs */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 md:py-28">
          <SectionHeading title="Let your agent write. OpenDocs handles the rest." />
          <div className="mt-12 grid grid-cols-1 gap-4 md:grid-cols-6">
            <article className="rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:col-span-4 md:p-9">
              <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">
                Stop spending tokens on PDF plumbing
              </h3>
              <p className="mt-3 max-w-[58ch] leading-relaxed text-zinc-600">
                Making a PDF from scratch means HTML, print CSS, a headless browser and a fight with
                page breaks, every time. OpenDocs does the typesetting, so your agent spends its
                tokens on the writing.
              </p>
              <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-2xl bg-zinc-50 p-5">
                  <p className="text-sm font-medium text-zinc-500">Without OpenDocs</p>
                  <ul className="mt-3 space-y-2 text-[15px] text-zinc-500 line-through decoration-zinc-300">
                    <li>Write HTML and print CSS</li>
                    <li>Install a PDF renderer</li>
                    <li>Debug fonts and page breaks</li>
                    <li>Start over for Word</li>
                  </ul>
                </div>
                <div className="rounded-2xl bg-[#F4F0FD] p-5">
                  <p className="text-sm font-medium text-[#5B33B0]">With OpenDocs</p>
                  <p className="mt-3 font-mono text-[13px] leading-relaxed text-zinc-800">
                    opendocs export report --format pdf
                  </p>
                  <p className="mt-2 text-[15px] text-zinc-600">One command. Word is the same with --format docx.</p>
                </div>
              </div>
            </article>

            <article className="flex flex-col rounded-3xl bg-[#F4F0FD] p-7 md:col-span-2 md:p-9">
              <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">
                On brand, automatically
              </h3>
              <p className="mt-3 leading-relaxed text-zinc-600">
                Nine tested presets, or your own dark brand color, one of ten fonts, your logo and
                footer.
              </p>
              <ul className="mt-6 grid grid-cols-3 gap-2" aria-label="Branding presets">
                {BRANDING_PRESETS.map((preset) => (
                  <li
                    key={preset.id}
                    title={`${preset.name}: ${preset.fontId}`}
                    className="h-9 rounded-xl ring-1 ring-black/5"
                    style={{ backgroundColor: preset.brandColor }}
                  >
                    <span className="sr-only">
                      {preset.name} ({preset.fontId})
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                <AgentPrompt>Use the Boardroom preset with our logo</AgentPrompt>
              </div>
            </article>

            <article className="flex flex-col rounded-3xl bg-zinc-100/80 p-7 md:col-span-2 md:p-8">
              <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">
                Organized like a repo
              </h3>
              <p className="mt-3 leading-relaxed text-zinc-600">
                Projects keep documents grouped by client, product or team, the way branches keep
                code apart. Your agent files each one in the right place.
              </p>
              <ul className="mt-6 space-y-2 text-[15px]">
                {[
                  ["Investors", 6],
                  ["Product", 14],
                  ["Handbook", 9],
                ].map(([name, count]) => (
                  <li
                    key={name}
                    className="flex items-center justify-between rounded-xl bg-white px-4 py-2.5 ring-1 ring-zinc-900/[0.05]"
                  >
                    <span className="font-medium text-zinc-800">{name}</span>
                    <span className="tabular-nums text-zinc-400">{count} docs</span>
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-2">
                <AgentPrompt>Put this in the Product project</AgentPrompt>
              </div>
            </article>

            <article className="flex flex-col rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:col-span-2 md:p-8">
              <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">
                Links that last
              </h3>
              <p className="mt-3 leading-relaxed text-zinc-600">
                Every document gets a readable URL that stays the same through every update.
                Private to your workspace by default, shared when you say so.
              </p>
              <p className="mt-6 break-all rounded-xl bg-zinc-50 px-4 py-3 font-mono text-[13px] text-zinc-700">
                opendocs.cc/halvard/projects/investors/q3-update
              </p>
              <div className="mt-auto pt-2">
                <AgentPrompt>Share it with dana@halvard.example</AgentPrompt>
              </div>
            </article>

            <article className="flex flex-col rounded-3xl bg-zinc-100/80 p-7 md:col-span-2 md:p-8">
              <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">
                Every version kept
              </h3>
              <p className="mt-3 leading-relaxed text-zinc-600">
                Agents rewrite documents often. OpenDocs keeps each version, shows who changed it
                and rolls back in one command.
              </p>
              <ol className="mt-6 space-y-2 text-[15px]">
                {[
                  ["v3", "Today, via Claude Code", true],
                  ["v2", "Yesterday, via Cursor", false],
                  ["v1", "Monday, by Dana", false],
                ].map(([version, when, latest]) => (
                  <li
                    key={version as string}
                    className="flex items-center gap-3 rounded-xl bg-white px-4 py-2.5 ring-1 ring-zinc-900/[0.05]"
                  >
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                        latest ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {version}
                    </span>
                    <span className="text-zinc-700">{when}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-auto pt-2">
                <AgentPrompt>Roll the spec back to yesterday</AgentPrompt>
              </div>
            </article>

            <article className="grid grid-cols-1 gap-8 rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:col-span-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center md:p-9">
              <div>
                <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">
                  Works with the agent you already use
                </h3>
                <p className="mt-3 max-w-[54ch] leading-relaxed text-zinc-600">
                  A skill for Claude Code, Codex, Cursor and others, a CLI, a REST API and a bash
                  client for machines without Node.js. Your agent signs you up from the terminal
                  with an emailed code.
                </p>
                <p className="mt-3 max-w-[54ch] leading-relaxed text-zinc-600">
                  In the Claude or ChatGPT app, connect the OpenDocs MCP server instead and sign in
                  with your OpenDocs account.
                </p>
                <Link
                  href="/mcp"
                  className="mt-4 inline-flex items-center gap-1.5 text-[15px] font-medium text-zinc-900 underline-offset-4 hover:underline"
                >
                  Connect Claude or ChatGPT
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="space-y-3">
                {[INSTALL_SKILL, INSTALL_SCRIPT].map((command) => (
                  <div
                    key={command}
                    className="flex items-center gap-3 rounded-xl bg-[#17151c] py-2 pl-4 pr-2 font-mono text-[12.5px] text-zinc-200"
                  >
                    <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {command}
                    </span>
                    <CopyButton
                      text={command}
                      className="flex-none rounded-lg bg-white/10 px-3 py-1.5 font-sans text-xs font-medium text-white transition hover:bg-white/20 active:scale-[0.97]"
                    />
                  </div>
                ))}
                <p className="text-[13px] leading-relaxed text-zinc-500">
                  If the first command ends with a PromptScript error, that&apos;s a known installer
                  bug. The skill is still installed.
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* Source code and self-hosting */}
        <section
          id="self-host"
          className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 pb-20 sm:px-8 md:pb-28"
        >
          <div className="rounded-3xl bg-[#17151c] px-7 py-10 shadow-[0_30px_60px_-30px_rgba(23,21,28,0.6)] sm:px-10 md:px-14 md:py-14">
            <div className="max-w-2xl">
              <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance text-white md:text-[40px]">
                <span className="sm:block">Read the code. </span>
                <span className="sm:block">Run it on your own server.</span>
              </h2>
              <p className="mt-4 max-w-[56ch] text-[17px] leading-relaxed text-pretty text-zinc-400">
                The app, API, MCP server and document converter are on GitHub. Host them with
                Docker for your team, with every feature unlocked and nothing to pay.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <a
                  href={SELF_HOSTING_GUIDE_URL}
                  className="inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-zinc-950 transition hover:bg-zinc-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/30"
                >
                  Self-hosting guide
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a
                  href={SOURCE_REPO_URL}
                  className="inline-flex items-center gap-2 text-[15px] font-medium text-zinc-300 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/github.svg" alt="" width={18} height={18} className="invert" />
                  View on GitHub
                </a>
                <a
                  href={TIP_JAR_URL}
                  className="inline-flex items-center gap-2 text-[15px] font-medium text-zinc-300 underline-offset-4 transition-colors hover:text-white hover:underline"
                >
                  <Coffee className="h-[18px] w-[18px]" aria-hidden="true" />
                  Buy me a coffee
                </a>
              </div>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-10 border-t border-white/10 pt-10 md:grid-cols-2 md:gap-14">
              <dl className="space-y-6">
                <div>
                  <dt className="w-fit rounded-md bg-white/10 px-2 py-0.5 font-mono text-[13px] text-white">
                    FSL-1.1-MIT
                  </dt>
                  <dd className="mt-2.5 max-w-[46ch] leading-relaxed text-zinc-400">
                    The app, API, MCP server and converter. Use, change and host them for anything
                    except a competing service. Each release becomes MIT after two years.
                  </dd>
                </div>
                <div>
                  <dt className="w-fit rounded-md bg-white/10 px-2 py-0.5 font-mono text-[13px] text-white">
                    MIT
                  </dt>
                  <dd className="mt-2.5 max-w-[46ch] leading-relaxed text-zinc-400">
                    The CLI, the browser extension and the agent skills.
                  </dd>
                </div>
              </dl>
              <ul className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 sm:gap-y-6 md:grid-cols-1 md:gap-y-5 xl:grid-cols-2 xl:gap-y-6">
                {SELF_HOST_POINTS.map(({ icon: Icon, text }) => (
                  <li key={text} className="flex gap-3 leading-snug text-zinc-300">
                    <Icon className="mt-0.5 h-5 w-5 flex-none text-[#C4B3F5]" aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="bg-white py-20 md:py-28">
          <div className="mx-auto w-full max-w-6xl px-5 sm:px-8">
            <SectionHeading title="Questions" />
            <dl className="mt-12 grid grid-cols-1 gap-x-14 gap-y-10 md:grid-cols-2">
              {FAQ.map((item) => (
                <div key={item.q}>
                  <dt className="text-[17px] font-semibold text-zinc-950">{item.q}</dt>
                  <dd className="mt-2 leading-relaxed text-pretty text-zinc-600">{item.a}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-12 text-[15px] text-zinc-600">
              More in the{" "}
              <Link href="/faq" className="font-medium text-zinc-900 underline underline-offset-4">
                FAQ
              </Link>
              ,{" "}
              <Link href="/pricing" className="font-medium text-zinc-900 underline underline-offset-4">
                pricing
              </Link>{" "}
              and the{" "}
              <a
                href="https://docs.opendocs.cc"
                className="font-medium text-zinc-900 underline underline-offset-4"
              >
                docs
              </a>
              .
            </p>
          </div>
        </section>

        {/* Final call to action */}
        <section className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 md:py-32">
          <div className="flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between">
            <div className="max-w-xl">
              <h2 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em] text-zinc-950 md:text-[44px]">
                Start with one prompt
              </h2>
              <p className="mt-4 text-[17px] leading-relaxed text-zinc-600">
                Paste it into your agent. It installs OpenDocs, signs you up with an emailed code
                and asks what to publish.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <CopyAgentPrompt className="inline-flex h-12 items-center gap-2.5 rounded-full bg-[#6B3FC9] px-6 text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(107,63,201,0.7)] transition hover:bg-[#5B33B0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25" />
              <Link
                href="/signup"
                className="text-[15px] font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
              >
                Sign up in the browser
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
