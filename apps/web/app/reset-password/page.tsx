import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { buildPageMetadata } from "@/lib/metadata";
import { ResetPasswordForm } from "./form";

export const metadata: Metadata = buildPageMetadata({
  title: "Reset password",
  description: "Set a new password for your OpenDocs account.",
  url: "https://opendocs.cc/reset-password",
  // Token-bearing URL — keeping it out of search indexes is both an
  // SEO and a privacy win (reset tokens shouldn't be crawlable even
  // though they expire).
  noIndex: true,
});

export default function ResetPasswordPage() {
  return (
    <div className="bg-white flex items-center relative w-full min-h-screen">
      <div className="flex flex-1 flex-row items-center justify-center self-stretch relative p-8">
        <div className="absolute left-8 top-8">
          <Link href="/">
            <Image src="/opendocs-logo.svg" alt="OpenDocs" width={138} height={26} priority />
          </Link>
        </div>
        <div className="w-full flex items-center justify-center mt-12">
          <div className="flex flex-col items-start max-w-[360px] w-full">
            <div className="flex flex-col gap-[32px] items-start w-full">
              <div className="flex flex-col gap-[12px] items-start w-full">
                <h1 className="font-semibold leading-[32px] text-[#171717] text-[24px] w-full">
                  Set a new password
                </h1>
                <p className="font-normal leading-[24px] text-[#525252] text-[16px] w-full">
                  Choose a new password for your account.
                </p>
              </div>

              <div className="flex flex-col gap-[24px] items-center rounded-[12px] w-full">
                <ResetPasswordForm />
              </div>

              <div className="flex gap-[4px] items-baseline justify-center w-full">
                <p className="font-normal leading-[20px] text-[#525252] text-[14px]">
                  Back to
                </p>
                <Link
                  href="/login"
                  className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
