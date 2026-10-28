import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";

import { CopyButton } from "@/app/components/copy-button";
import { AddToChatGptButton } from "@/components/add-to-chatgpt-button";
import { AddToClaudeButton } from "@/components/add-to-claude-button";
import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { CommandRow } from "@/components/marketing/command-row";
import { MCP_APP_TABS, PRIMARY_BUTTON_LG, SECONDARY_BUTTON_LG } from "@/components/marketing/mcp-app-setup";
import { Tabs } from "@/components/marketing/tabs";
import { getServerSession } from "@/lib/auth/session";
import {
  CLI_MCP_ADD_COMMAND,
  CLI_MCP_CONNECT_CLAUDE_COMMAND,
  CONNECTED_APPS_PATH,
  MCP_DISPLAY_NAME,
  MCP_DOCS_URL,
  MCP_PAGE_URL,
  MCP_SERVER_URL,
  MCP_TOOLS_DOCS_URL,
} from "@/lib/mcp";
import { buildPageMetadata } from "@/lib/metadata";

import "../landing.css";

export const metadata: Metadata = buildPageMetadata({
  title: "MCP server for Claude, ChatGPT and AI apps",
  description:
    "Connect OpenDocs to Claude, ChatGPT, Claude Code, Codex, Cursor, VS Code and other AI apps. Sign in with your OpenDocs account, then ask it to publish, export, share and send documents for signature. Works on every plan.",
  url: MCP_PAGE_URL,
});

const H2 = "text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance text-zinc-950 md:text-[36px]";

const ASKS = [
  {
    prompt: "Publish this as a doc in our Legal project.",
    result: "A link only your workspace can open, filed in Legal.",
  },
  {
    prompt: "Make a PDF of the Acme NDA.",
    result: "A PDF with your logo, colors and font, as a download link.",
  },
  {
    prompt: "Send the employment contract to Jón for signature.",
    result: "A draft first. It reads back every signer and sends only after you say yes.",
  },
  {
    prompt: "Who has access to the board memo?",
    result: "The people, email domains and visibility, in plain words.",
  },
  {
    prompt: "Fix the date in section 3 of the NDA.",
    result: "A small edit saved as a new version, so the old one is still there.",
  },
  {
    prompt: "Save the signed contract to our Contracts folder in Google Drive.",
    result: "The signed PDF, filed in the Drive folder your workspace connected.",
  },
];

const ABILITIES = [
  "Publish documents and update them at the same link, with every version kept",
  "Export PDF and Word files with your workspace's branding",
  "Organize documents into projects",
  "Share with people or email domains, and make public only when you say so",
  "Save to Google Drive and send documents for e-signature",
  "Manage your team and export theme, if you're an owner or admin and allow it",
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "MCP or the skill?",
    a: "Chat apps such as Claude and ChatGPT use MCP. Coding tools such as Claude Code, Codex and Cursor can use either. The skill and CLI are better for local files, folders and images; MCP needs nothing installed.",
  },
  {
    q: "What can OpenDocs see?",
    a: "Only what the AI sends to the OpenDocs tools, such as a document's text or the email of someone you share it with. OpenDocs never sees your chats, your other files or your other connectors.",
  },
  {
    q: "How do I disconnect?",
    a: (
      <>
        Open{" "}
        <Link href={CONNECTED_APPS_PATH} className="font-medium text-zinc-900 underline underline-offset-4">
          Dashboard → Connected apps
        </Link>{" "}
        and revoke the app. It loses access within a minute. You can also remove the connector in the app
        itself.
      </>
    ),
  },
  {
    q: "Is it free?",
    a: "Yes. MCP works on every OpenDocs plan, including Free. Your plan's usual limits apply, the same as with the CLI.",
  },
  {
    q: "What's the difference from the Claude Code skill?",
    a: "They do the same jobs. The skill teaches Claude Code to run the OpenDocs CLI on your computer, so it publishes files and folders straight from disk, uploads local images and saves PDFs next to the source. Over MCP, the AI sends the text itself and files come back as download links.",
  },
  {
    q: "What does the app ask permission for?",
    a: "The sign-in screen lists what the app may do: read your documents; create, update, share and export them; use Google Drive and e-signatures; and, for owners and admins only, manage the team and workspace. That last one is off unless you turn it on.",
  },
];

function ChatExample() {
  return (
    <figure className="rounded-[28px] bg-white p-5 ring-1 ring-zinc-900/[0.06] shadow-[0_30px_60px_-30px_rgba(38,24,72,0.25)] sm:p-7">
      <figcaption className="sr-only">An example chat that uses OpenDocs over MCP</figcaption>
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-[15px] leading-snug text-zinc-900">
          Publish this NDA in our Legal project and make me a PDF.
        </p>
      </div>
      <ul className="mt-5 space-y-2">
        {["publish_document", "export_document"].map((tool) => (
          <li key={tool} className="flex min-w-0 items-center gap-2 text-[13px] text-zinc-500">
            <span className="flex h-6 w-6 flex-none items-center justify-center rounded-md bg-[#F4F0FD]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/opendocs-icon.svg" alt="" width={14} height={14} />
            </span>
            <span className="font-medium text-zinc-700">{MCP_DISPLAY_NAME}</span>
            <span className="truncate font-mono">{tool}</span>
          </li>
        ))}
      </ul>
      <div className="mt-5 space-y-3 text-[15px] leading-relaxed text-zinc-800">
        <p>Done. The NDA is in Legal, and only your workspace can open it:</p>
        <p className="break-all rounded-xl bg-zinc-50 px-3.5 py-2.5 font-mono text-[13px] text-[#5B33B0]">
          opendocs.cc/halvard/projects/legal/mutual-nda
        </p>
        <p>
          The PDF, with your logo and colors:{" "}
          <span className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4">
            mutual-nda.pdf
          </span>
        </p>
      </div>
    </figure>
  );
}

export default async function McpPage() {
  const session = await getServerSession();

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />

      <main className="mk-page">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-12 pt-32 sm:px-8 md:pt-36 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#F4F0FD] px-3 py-1 text-[13px] font-semibold text-[#5B33B0]">
              MCP server
            </p>
            <h1 className="mt-5 text-[36px] font-semibold leading-[1.06] tracking-[-0.035em] text-balance text-zinc-950 sm:text-[48px]">
              Use OpenDocs from Claude, ChatGPT and any AI app
            </h1>
            <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-pretty text-zinc-600">
              Connect once, then ask in plain words. Your AI writes the document; OpenDocs publishes it as a
              link, exports a branded PDF or Word file, shares it and sends it for signature.
            </p>

            <div className="mt-8 flex max-w-[34rem] items-center gap-3 rounded-2xl bg-white py-2 pl-4 pr-2 text-[13px] font-semibold ring-1 ring-zinc-900/[0.08]">
              <span className="hidden flex-none text-[13px] font-medium text-zinc-500 sm:inline">Server URL</span>
              <code className="min-w-0 flex-1 truncate font-mono text-[14px] text-zinc-900">{MCP_SERVER_URL}</code>
              <CopyButton
                text={MCP_SERVER_URL}
                srLabel="server URL"
                className="flex-none rounded-lg bg-[#F4F0FD] px-3 py-1.5 text-xs font-semibold text-[#5B33B0] transition hover:bg-[#EBE3FC] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6B3FC9]/30"
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
              <AddToClaudeButton className={PRIMARY_BUTTON_LG} />
              <AddToChatGptButton className={SECONDARY_BUTTON_LG} />
              <div className="flex items-center gap-x-6">
                <a
                  href="#apps"
                  className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-950 hover:underline"
                >
                  Other apps
                </a>
                <a
                  href={MCP_DOCS_URL}
                  className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-950 hover:underline"
                >
                  Setup guide
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </div>

            <ul className="mt-8 flex flex-col gap-2 text-[15px] text-zinc-600">
              {["Every plan, including Free", "Sign in with your OpenDocs account", "Asks before sharing or sending"].map(
                (item) => (
                  <li key={item} className="inline-flex items-center gap-2">
                    <Check className="h-4 w-4 flex-none text-[#6B3FC9]" aria-hidden="true" />
                    {item}
                  </li>
                ),
              )}
            </ul>
          </div>

          <ChatExample />
        </section>

        {/* Pick your app */}
        <section id="apps" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-12 sm:px-8 md:py-16">
          <h2 className={H2}>Pick your app</h2>
          <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-pretty text-zinc-600">
            The first time the app uses OpenDocs, it opens a page where you sign in and choose what it may do.
            New to OpenDocs? The same page creates your account.
          </p>
          <Tabs label="Apps" items={MCP_APP_TABS} className="mt-10" />

          <div className="mt-6 grid grid-cols-1 gap-5 rounded-3xl bg-[#F4F0FD] p-6 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
            <div>
              <h3 className="font-semibold text-zinc-950">Have the OpenDocs CLI?</h3>
              <p className="mt-1.5 leading-relaxed text-zinc-700">
                <code className="font-mono text-[0.9em]">{CLI_MCP_ADD_COMMAND}</code> adds the server to every coding
                tool it finds. <code className="font-mono text-[0.9em]">{CLI_MCP_CONNECT_CLAUDE_COMMAND}</code> (or{" "}
                <code className="font-mono text-[0.9em]">chatgpt</code>) opens the app&apos;s add page and copies the
                URL.
              </p>
            </div>
            <div className="min-w-0 space-y-2">
              <CommandRow command={CLI_MCP_ADD_COMMAND} />
              <CommandRow command={CLI_MCP_CONNECT_CLAUDE_COMMAND} />
            </div>
          </div>
        </section>

        {/* Things to ask */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
          <h2 className={H2}>Things to ask</h2>
          <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-pretty text-zinc-600">
            Plain words work. The AI picks the right OpenDocs tool and ends with a link you can open.
          </p>
          <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ASKS.map((ask) => (
              <li key={ask.prompt} className="flex flex-col rounded-3xl bg-white p-6 ring-1 ring-zinc-900/[0.06] sm:p-7">
                <p className="border-l-2 border-[#6B3FC9] pl-4 text-[17px] leading-snug text-zinc-950">
                  &ldquo;{ask.prompt}&rdquo;
                </p>
                <p className="mt-4 text-[15px] leading-relaxed text-zinc-600">{ask.result}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-zinc-500">
            Google Drive and e-signatures work once they&apos;re connected in your workspace (Pro and Team).
          </p>
        </section>

        {/* What it can do */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
            <article className="rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:p-9">
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-zinc-950">What it can do</h2>
              <ul className="mt-6 space-y-3.5">
                {ABILITIES.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed text-zinc-700">
                    <Check className="mt-1 h-4 w-4 flex-none text-[#6B3FC9]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <a
                href={MCP_TOOLS_DOCS_URL}
                className="mt-7 inline-flex items-center gap-1 text-[15px] font-medium text-zinc-900 underline-offset-4 hover:underline"
              >
                Every tool, in the docs
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </article>

            <article className="flex flex-col rounded-3xl bg-[#F4F0FD] p-7 md:p-9">
              <h2 className="text-[24px] font-semibold tracking-[-0.02em] text-zinc-950">You stay in control</h2>
              <div className="mt-6 space-y-4 leading-relaxed text-zinc-700">
                <p>
                  You choose what the app may do when you sign in. Team and workspace admin stays off unless you
                  turn it on.
                </p>
                <p>
                  The AI asks you first, in plain words, before anything goes public, gets deleted, is emailed or is
                  sent for signature.
                </p>
                <p>
                  Disconnect any time in{" "}
                  <Link href={CONNECTED_APPS_PATH} className="font-medium text-zinc-900 underline underline-offset-4">
                    Connected apps
                  </Link>
                  .
                </p>
              </div>
            </article>
          </div>
        </section>

        {/* FAQ */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
          <h2 className={H2}>Questions</h2>
          <dl className="mt-10 grid grid-cols-1 gap-x-14 gap-y-10 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q}>
                <dt className="text-[17px] font-semibold text-zinc-950">{item.q}</dt>
                <dd className="mt-2 leading-relaxed text-pretty text-zinc-600">{item.a}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Closing */}
        <section className="mx-auto w-full max-w-[760px] px-5 py-12 sm:px-6 md:py-16">
          <div className="rounded-[28px] bg-white p-7 ring-1 ring-zinc-900/[0.07] sm:p-10">
            <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-balance text-zinc-950 sm:text-[32px]">
              Connect OpenDocs in a minute
            </h2>
            <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-pretty text-zinc-600">
              Add the server, sign in with your OpenDocs account and ask for your first document. The setup guide
              covers every app, permissions and troubleshooting.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <AddToClaudeButton className={PRIMARY_BUTTON_LG} />
              <AddToChatGptButton className={SECONDARY_BUTTON_LG} />
              <a
                href={MCP_DOCS_URL}
                className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
              >
                Read the setup guide
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
            <p className="mt-5 text-sm text-zinc-500">Works on every plan, including Free.</p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
