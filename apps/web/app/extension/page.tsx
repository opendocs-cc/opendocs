import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, Minus } from "lucide-react";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { ExtensionPreview } from "@/components/marketing/extension-preview";
import { PRIMARY_BUTTON_LG } from "@/components/marketing/mcp-app-setup";
import { getServerSession } from "@/lib/auth/session";
import { EXTENSION_DOCS_URL, EXTENSION_PAGE_URL, EXTENSION_SOURCE_URL, extensionStoreLinks } from "@/lib/extension";
import { buildPageMetadata } from "@/lib/metadata";

import "../landing.css";

export const metadata: Metadata = buildPageMetadata({
  title: "Publish ChatGPT, Claude and Gemini answers as documents",
  description:
    "A free browser extension that turns any ChatGPT, Claude or Gemini answer, or a whole chat, into a clean OpenDocs link and a PDF. Math, tables, code and sources included. No account needed.",
  url: EXTENSION_PAGE_URL,
});

const H2 = "text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-balance text-zinc-950 md:text-[36px]";

const SHARE_LINK = [
  "The whole chat, in the chat app's look",
  "Can't be edited or saved as a PDF",
  "Gone when the chat is deleted",
];

const OPENDOCS = [
  "Just the answer, or the chat with your questions",
  "A clean page and a PDF, free and without a watermark",
  "Kept in your workspace and updated at the same link",
];

const STEPS = [
  {
    verb: "Click Publish",
    text: "Under any answer. Switch the card to Whole chat to publish the conversation.",
  },
  {
    verb: "Check where it goes",
    text: "Without an account you get a link that lasts 24 hours. Signed in, it goes to your workspace with your branding.",
  },
  {
    verb: "Share it",
    text: "The link is copied for you. Download the PDF, or a Word file on Pro.",
  },
];

const FAQ: { q: string; a: ReactNode }[] = [
  {
    q: "Do I need an account?",
    a: "No. Without one you get a link that lasts 24 hours and a PDF. Sign up free to keep your documents: the extension moves the ones you published from this browser into your workspace.",
  },
  {
    q: "Is it free?",
    a: "Yes. The Free plan keeps up to 50 documents with a small \"Made with OpenDocs\" footer. Pro adds Word files, your own footer and unlimited documents.",
  },
  {
    q: "Who can see what I publish?",
    a: "Without an account, anyone with the link, for 24 hours. Signed in, the members of your workspace by default, and you can make a document private or public.",
  },
  {
    q: "Can I fix a document after publishing?",
    a: "Yes, when you're signed in. Publish the same answer again and choose Update: the link stays the same and the old version is kept.",
  },
  {
    q: "Which browsers does it work in?",
    a: "Chrome and Microsoft Edge. Firefox is planned.",
  },
  {
    q: "How is it different from the MCP connector?",
    a: (
      <>
        The extension publishes exactly what&apos;s on your screen with one click. The{" "}
        <Link href="/mcp" className="font-medium text-zinc-900 underline underline-offset-4">
          MCP connector
        </Link>{" "}
        lets Claude or ChatGPT write, edit and manage documents for you. They work well together.
      </>
    ),
  },
];

function InstallButtons({ chrome, edge }: { chrome: string | null; edge: string | null }) {
  if (!chrome && !edge) {
    return (
      <span className="inline-flex items-center rounded-2xl bg-zinc-100 px-5 py-3 text-[15px] font-semibold text-zinc-600">
        Coming soon to the Chrome Web Store
      </span>
    );
  }
  return (
    <>
      {chrome ? (
        <a href={chrome} className={PRIMARY_BUTTON_LG}>
          Add to Chrome
        </a>
      ) : null}
      {edge ? (
        <a
          href={edge}
          className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-950 hover:underline"
        >
          Get it for Edge
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      ) : null}
    </>
  );
}

export default async function ExtensionPage() {
  const session = await getServerSession();
  const stores = extensionStoreLinks();

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />

      <main className="mk-page">
        {/* Hero */}
        <section className="mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-12 px-5 pb-12 pt-32 sm:px-8 md:pt-36 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 rounded-full bg-[#F4F0FD] px-3 py-1 text-[13px] font-semibold text-[#5B33B0]">
              Browser extension
            </p>
            <h1 className="mt-5 text-[36px] font-semibold leading-[1.06] tracking-[-0.035em] text-balance text-zinc-950 sm:text-[48px]">
              Turn any AI answer into a document you can share
            </h1>
            <p className="mt-5 max-w-[34rem] text-lg leading-relaxed text-pretty text-zinc-600">
              One click on ChatGPT, Claude or Gemini gives you a clean link and a PDF. No account needed.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
              <InstallButtons chrome={stores.chrome} edge={stores.edge} />
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 transition-colors hover:text-zinc-950 hover:underline"
              >
                How it works
              </a>
            </div>
          </div>

          <ExtensionPreview />
        </section>

        {/* Compared with a share link */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
          <h2 className={H2}>A document, not a copy of the chat</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-3xl bg-zinc-50 p-7 ring-1 ring-zinc-900/[0.04] md:p-9">
              <h3 className="text-[17px] font-semibold text-zinc-700">The chat app&apos;s share link</h3>
              <ul className="mt-5 space-y-3">
                {SHARE_LINK.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed text-zinc-600">
                    <Minus className="mt-1 h-4 w-4 flex-none text-zinc-400" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl bg-white p-7 ring-1 ring-[#6B3FC9]/20 shadow-[0_24px_48px_-32px_rgba(38,24,72,0.3)] md:p-9">
              <h3 className="text-[17px] font-semibold text-zinc-950">OpenDocs</h3>
              <ul className="mt-5 space-y-3">
                {OPENDOCS.map((item) => (
                  <li key={item} className="flex gap-3 leading-relaxed text-zinc-800">
                    <Check className="mt-1 h-4 w-4 flex-none text-[#6B3FC9]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="mx-auto w-full max-w-6xl scroll-mt-24 px-5 py-12 sm:px-8 md:py-16">
          <h2 className={H2}>How it works</h2>
          <ol className="mt-10 max-w-3xl">
            {STEPS.map((step, i) => (
              <li
                key={step.verb}
                className={`grid grid-cols-1 gap-2 py-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:gap-8 ${i > 0 ? "border-t border-zinc-200/70" : ""}`}
              >
                <h3 className="text-[19px] font-semibold tracking-[-0.01em] text-zinc-950">{step.verb}</h3>
                <p className="leading-relaxed text-pretty text-zinc-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* What carries over */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
          <h2 className={H2}>Everything in the answer comes along</h2>
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-6">
            <article className="flex flex-col justify-between gap-8 rounded-3xl bg-[#F4F0FD] p-7 md:col-span-4 md:p-9">
              <p className="font-mono text-[26px] leading-tight text-[#3E2384] sm:text-[32px]" aria-hidden="true">
                ∫₀¹ x² dx = ⅓
              </p>
              <div>
                <h3 className="text-[19px] font-semibold text-zinc-950">Math that stays math</h3>
                <p className="mt-2 max-w-[44ch] leading-relaxed text-zinc-700">
                  Formulas render properly on the page and in the PDF, not as raw code.
                </p>
              </div>
            </article>
            <article className="rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:col-span-2 md:p-8">
              <h3 className="text-[19px] font-semibold text-zinc-950">Your questions, too</h3>
              <p className="mt-2 leading-relaxed text-zinc-600">
                A whole chat shows each question above its answer, so readers can follow along.
              </p>
            </article>
            <article className="rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:col-span-2 md:p-8">
              <h3 className="text-[19px] font-semibold text-zinc-950">Tables and code</h3>
              <p className="mt-2 leading-relaxed text-zinc-600">
                Tables stay tables. Code keeps its language and highlighting.
              </p>
            </article>
            <article className="rounded-3xl bg-zinc-50 p-7 ring-1 ring-zinc-900/[0.04] md:col-span-2 md:p-8">
              <h3 className="text-[19px] font-semibold text-zinc-950">Sources as footnotes</h3>
              <p className="mt-2 leading-relaxed text-zinc-600">
                Web citations become numbered footnotes with a list of sources at the end.
              </p>
            </article>
            <article className="rounded-3xl bg-white p-7 ring-1 ring-zinc-900/[0.06] md:col-span-2 md:p-8">
              <h3 className="text-[19px] font-semibold text-zinc-950">Images and canvases</h3>
              <p className="mt-2 leading-relaxed text-zinc-600">
                Signed in, images come along, and so does the final version of a canvas or artifact.
              </p>
            </article>
          </div>
        </section>

        {/* Privacy */}
        <section className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 md:py-16">
          <div className="grid grid-cols-1 gap-8 rounded-3xl bg-[#F4F0FD] p-7 md:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
            <div>
              <h2 className="text-[26px] font-semibold leading-[1.15] tracking-[-0.025em] text-balance text-zinc-950 md:text-[32px]">
                It reads a chat only when you click
              </h2>
              <p className="mt-4 max-w-[52ch] leading-relaxed text-pretty text-zinc-700">
                Nothing is read in the background and no chats are stored in the extension. When you click Publish, it
                sends that answer or chat to OpenDocs to make your document, and nothing else.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3">
                <a
                  href={EXTENSION_SOURCE_URL}
                  className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-900 underline-offset-4 hover:underline"
                >
                  Read the source on GitHub
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <Link
                  href="/privacy#browser-extension"
                  className="text-[15px] font-medium text-zinc-900 underline-offset-4 hover:underline"
                >
                  Privacy policy
                </Link>
              </div>
            </div>
            <ul className="space-y-4 self-center">
              {[
                "Works on chatgpt.com, claude.ai and gemini.google.com, and nowhere else",
                "Open source, so anyone can check what it sends",
                "If it can't read a chat, it tells us the site and the step that failed, never the content",
              ].map((item) => (
                <li key={item} className="flex gap-3 leading-relaxed text-zinc-800">
                  <Check className="mt-1 h-4 w-4 flex-none text-[#6B3FC9]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
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
              Share your next answer properly
            </h2>
            <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-pretty text-zinc-600">
              Install the extension, open a chat and click Publish under the answer you want to share.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <InstallButtons chrome={stores.chrome} edge={stores.edge} />
              <a
                href={EXTENSION_DOCS_URL}
                className="inline-flex items-center gap-1 text-[15px] font-medium text-zinc-700 underline-offset-4 hover:text-zinc-950 hover:underline"
              >
                Read the guide
                <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
