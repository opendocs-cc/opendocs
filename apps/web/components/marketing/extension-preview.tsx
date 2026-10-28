import { Check, Copy, Download, ExternalLink, RotateCcw, ThumbsUp } from "lucide-react";

/**
 * The /extension hero: an AI answer with the extension's button in its
 * action row and the card it opens after publishing. A small, faithful
 * render of the extension's real UI (opendocs-cc/opendocs-extension).
 */
export function ExtensionPreview() {
  return (
    <figure className="relative">
      <figcaption className="sr-only">
        An AI answer with the OpenDocs button, and the card that shows the published link and a PDF download
      </figcaption>
      <div className="rounded-[28px] bg-white p-5 ring-1 ring-zinc-900/[0.06] shadow-[0_30px_60px_-30px_rgba(38,24,72,0.25)] sm:p-7">
        <div className="flex justify-end">
          <p className="max-w-[85%] rounded-2xl rounded-br-md bg-zinc-100 px-4 py-2.5 text-[15px] leading-snug text-zinc-900">
            Draft a one-page mutual NDA for a pilot with Halvard Studio.
          </p>
        </div>
        <div className="mt-5 space-y-2.5 text-[15px] leading-relaxed text-zinc-800">
          <p className="font-semibold text-zinc-950">Mutual Non-Disclosure Agreement</p>
          <p>
            This Agreement is made between <span className="font-medium">Kjarni ehf.</span> and{" "}
            <span className="font-medium">Halvard Studio</span> to protect confidential information shared during the
            pilot.
          </p>
          <p className="text-zinc-500">1. Definition of Confidential Information …</p>
        </div>
        <div className="mt-4 flex items-center gap-1 text-zinc-400">
          {[Copy, ThumbsUp, RotateCcw].map((Icon, i) => (
            <span key={i} className="flex h-8 w-8 items-center justify-center rounded-lg">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
          ))}
          <span className="ml-1 inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#F4F0FD] px-2.5 text-[13px] font-medium text-[#5B33B0] ring-1 ring-[#6B3FC9]/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/opendocs-icon.svg" alt="" width={14} height={14} />
            Publish
          </span>
        </div>
      </div>

      <div className="relative z-[1] -mt-6 ml-auto w-[min(100%,330px)] rounded-2xl bg-white p-4 ring-1 ring-zinc-900/[0.08] shadow-[0_24px_48px_-20px_rgba(38,24,72,0.35)] sm:-mr-4">
        <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-zinc-950">
          <Check className="h-4 w-4 text-[#6B3FC9]" aria-hidden="true" />
          Published. Link copied.
        </p>
        <p className="mt-2 truncate rounded-lg bg-zinc-50 px-3 py-2 font-mono text-[12.5px] text-[#5B33B0]">
          opendocs.cc/a/k3V9pQx2mR7tYw4b
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <span className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#6B3FC9] px-3 py-2 text-[13px] font-semibold text-white">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open
          </span>
          <span className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-semibold text-zinc-800 ring-1 ring-zinc-200">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            PDF
          </span>
        </div>
        <p className="mt-3 text-[12.5px] leading-snug text-zinc-500">
          Anyone with the link can read it for 24 hours.{" "}
          <span className="font-medium text-[#5B33B0]">Keep it: sign up free</span>
        </p>
      </div>
    </figure>
  );
}
