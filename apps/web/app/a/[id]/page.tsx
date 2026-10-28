import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getAnonymousDoc } from "@opendocs/shared/anonymous/service";
import { normalizeStoredRenderedHtml } from "@opendocs/shared/markdown/normalize-rendered-html";
import { ArticleBody } from "@/components/article-body";
import { DocMarkdownStyles } from "@/components/doc-article";
import { ReportPage } from "@/components/free-tools/report-page";
import { OpenDocsWordmark } from "@/components/opendocs-wordmark";
import { API_BASE_URL } from "@/lib/config/api";
import { getServerSession } from "@/lib/auth/session";

type AnonymousDocPageProps = {
  params: Promise<{ id: string }>;
};

// Anonymous docs are only reachable through their unguessable link, so
// they must never be indexed or cached by shared caches.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: AnonymousDocPageProps): Promise<Metadata> {
  const { id } = await params;
  const doc = await getAnonymousDoc(id);
  return {
    title: !doc ? "Document expired" : doc.hidden ? "Page under review" : doc.title,
    description: doc?.summary ?? undefined,
    robots: { index: false, follow: false, nocache: true },
  };
}

function expiresInLabel(expiresAt: Date) {
  const minutes = Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60_000));
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export default async function AnonymousDocPage({ params }: AnonymousDocPageProps) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) notFound();

  const [doc, session] = await Promise.all([getAnonymousDoc(id), getServerSession()]);
  if (!doc) notFound();

  // Pages from the browser extension point their readers to it: they're likely AI chat users too.
  const fromExtension = doc.client?.startsWith("opendocs-extension") ?? false;

  const makeYourOwn = (
    <Link
      href="/try"
      className="inline-flex shrink-0 items-center gap-1 font-semibold text-[#6941C6] underline-offset-4 hover:underline dark:text-[#D6BBFB]"
    >
      Make your own link
      <span aria-hidden="true">&rarr;</span>
    </Link>
  );

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-zinc-50 antialiased dark:bg-[#050506]" dir="ltr">
      <DocMarkdownStyles />
      <div className="pointer-events-none fixed inset-0 flex justify-center sm:px-8">
        <div className="flex w-full max-w-7xl lg:px-8">
          <div className="w-full bg-white ring-1 ring-zinc-100 dark:bg-zinc-950 dark:ring-white/10" />
        </div>
      </div>
      <div className="relative flex w-full flex-col">
        <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-8 sm:px-8">
          <Link href="/" aria-label="OpenDocs home" className="text-zinc-900 dark:text-zinc-50">
            <OpenDocsWordmark />
          </Link>
          <div className="flex items-center gap-2">
            {doc.hidden ? null : (
              // A plain link: the API answers with the PDF as an attachment.
              <a
                href={`${API_BASE_URL}/api/v1/anonymous/${doc.id}/export/pdf`}
                rel="nofollow"
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:text-zinc-200 dark:ring-white/15 dark:hover:bg-white/5"
              >
                Download PDF
              </a>
            )}
            <Link
              href={session ? "/dashboard" : "/signup"}
              className="rounded-lg bg-[#7F56D9] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#6941C6]"
            >
              {session ? "Dashboard" : "Publish your own"}
            </Link>
          </div>
        </header>
        <main className="relative flex-auto px-4 pb-16 sm:px-8">
          <div className="mx-auto mt-12 max-w-3xl">
            {doc.hidden ? (
              <div
                role="note"
                className="rounded-xl border border-zinc-200 bg-white px-5 py-6 text-sm leading-6 text-zinc-700 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
                  This page is under review
                </h1>
                <p className="mt-2">
                  Readers reported it, so it&apos;s hidden until we&apos;ve looked at it. Anonymous pages
                  are deleted 24 hours after they&apos;re published.
                </p>
                <div className="mt-4">{makeYourOwn}</div>
              </div>
            ) : (
              <>
                <div
                  role="note"
                  className="mb-8 flex flex-col gap-2 rounded-xl border border-[#E9D7FE] bg-[#F9F5FF] px-4 py-3 text-sm leading-6 text-[#42307D] sm:flex-row sm:items-start sm:justify-between sm:gap-6 dark:border-[#53389E] dark:bg-[#1C1530] dark:text-[#E9D7FE]"
                >
                  <p>
                    <strong>Shared anonymously with OpenDocs.</strong> Anyone with this link can read it
                    for the next {expiresInLabel(doc.expiresAt)}, then it&apos;s deleted. The author
                    hasn&apos;t verified their identity.
                  </p>
                  {makeYourOwn}
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">
                  {doc.title}
                </h1>
                <div className="od-mkdocs mt-6">
                  <article className="md-typeset">
                    <ArticleBody html={normalizeStoredRenderedHtml(doc.renderedHtml)} />
                  </article>
                </div>
              </>
            )}
            <footer className="mt-16 flex flex-col gap-4 border-t border-zinc-200 pt-6 text-sm text-zinc-500 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between dark:border-white/10 dark:text-zinc-400">
              <p>
                Made with{" "}
                <Link
                  href={
                    fromExtension
                      ? "/extension?utm_source=anonymous&utm_medium=page_footer&utm_content=extension"
                      : "/?utm_source=anonymous&utm_medium=page_footer"
                  }
                  className="font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-200"
                >
                  {fromExtension ? "OpenDocs for Chrome" : "OpenDocs"}
                </Link>
                {fromExtension ? ". Publish your AI chats as links and PDFs, free." : ". Paste Markdown, get a link like this one."}
              </p>
              {doc.hidden ? null : <ReportPage docId={doc.id} />}
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
}
