import type { Metadata } from "next";
import Link from "next/link";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import { UninstallFeedback } from "./uninstall-feedback";

import "../../landing.css";

export const metadata: Metadata = {
  ...buildPageMetadata({
    title: "The OpenDocs extension was removed",
    description: "Tell us why you removed the OpenDocs browser extension.",
    url: "https://opendocs.cc/extension/uninstalled",
  }),
  robots: { index: false, follow: false },
};

/** Chrome opens this page when someone removes the extension (chrome.runtime.setUninstallURL). */
export default async function ExtensionUninstalledPage() {
  const session = await getServerSession();

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />
      <main className="mk-page">
        <section className="mx-auto w-full max-w-[640px] px-5 pb-16 pt-32 sm:px-6 md:pt-36">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] text-balance text-zinc-950 sm:text-[40px]">
            The extension is removed
          </h1>
          <p className="mt-4 text-[17px] leading-relaxed text-pretty text-zinc-600">
            Documents you published while signed in stay in your workspace. One quick question helps us make it
            better.
          </p>
          <div className="mt-10 rounded-[28px] bg-white p-6 ring-1 ring-zinc-900/[0.07] sm:p-8">
            <UninstallFeedback />
          </div>
          <p className="mt-8 text-[15px] text-zinc-600">
            Changed your mind?{" "}
            <Link href="/extension" className="font-medium text-zinc-900 underline underline-offset-4">
              Install it again
            </Link>
            .
          </p>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
