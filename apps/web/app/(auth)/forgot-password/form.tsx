"use client";

import { Key, Mail, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { startTransition, useState } from "react";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleSubmit = () => {
    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/request-password-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, redirectTo: "/reset-password" }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message ?? "Something went wrong.");
        }

        setSent(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  if (sent) {
    return (
      <div className="flex flex-col gap-[32px] items-center max-w-[360px] w-full">
        <div className="flex flex-col gap-[24px] items-center w-full text-center">
          <div className="relative rounded-[10px] size-[48px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
            <Mail className="w-[20px] h-[20px] text-[#404040]" strokeWidth={2} />
          </div>
          <div className="flex flex-col gap-[12px] items-center w-full">
            <h1 className="font-semibold leading-[32px] text-[#171717] text-[24px] w-full">
              Check your email
            </h1>
            <p className="font-normal leading-[24px] text-[#525252] text-[16px] w-full">
              We sent a password reset link to{" "}
              <br />
              <span className="font-medium text-[#171717]">{email}</span>
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-[32px] items-center rounded-[12px] w-full">
          <button
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
          >
            Didn&apos;t receive the email? Click to resend
          </button>
        </div>

        <Link
          href="/login"
          className="flex gap-[8px] items-center justify-center hover:text-[#404040] text-[#525252] transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-[#A3A3A3]" strokeWidth={1.67} />
          <span className="font-semibold leading-[20px] text-[14px]">Back to log in</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[32px] items-center max-w-[360px] w-full">
      <div className="flex flex-col gap-[24px] items-center w-full text-center">
        <div className="relative rounded-[10px] size-[48px] bg-white border border-[#d4d4d4] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] flex items-center justify-center">
          <Key className="w-[20px] h-[20px] text-[#404040]" strokeWidth={2} />
        </div>
        <div className="flex flex-col gap-[12px] items-center w-full">
          <h1 className="font-semibold leading-[32px] text-[#171717] text-[24px] w-full">
            Forgot password?
          </h1>
          <p className="font-normal leading-[24px] text-[#525252] text-[16px] w-full">
            No worries, we&apos;ll send you reset instructions.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-[24px] items-center rounded-[12px] w-full">
        <div className="w-full">
          <div className="flex flex-col gap-[6px] items-start w-full">
            <p className="font-medium leading-[20px] text-[#404040] text-[14px]">Email</p>
            <div className="bg-white relative rounded-[8px] w-full group">
              <div
                aria-hidden="true"
                className="absolute border border-[#d4d4d4] group-focus-within:border-[#6941c6] group-focus-within:ring-4 group-focus-within:ring-[#f4ebff] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-all"
              />
              <div className="flex flex-row items-center w-full relative z-10">
                <div className="flex gap-[8px] items-center px-[14px] py-[10px] w-full">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="flex-1 font-normal leading-[24px] bg-transparent outline-none text-[#171717] placeholder:text-[#737373] text-[16px] w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          type="button"
          disabled={isPending || !email}
          onClick={handleSubmit}
          className="relative rounded-[8px] w-full hover:bg-[#6941c6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <div
            aria-hidden="true"
            className="absolute bg-[#7f56d9] inset-0 pointer-events-none rounded-[8px]"
          />
          <div className="flex flex-row items-center justify-center overflow-hidden rounded-[inherit] w-full relative z-10">
            <div className="flex gap-[6px] items-center justify-center px-[16px] py-[10px] w-full">
              <p className="font-semibold leading-[24px] text-[16px] text-white whitespace-nowrap">
                {isPending ? "Sending..." : "Reset password"}
              </p>
            </div>
          </div>
          <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
          <div
            aria-hidden="true"
            className="absolute border-2 border-[rgba(255,255,255,0.12)] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
          />
        </button>

        {error && (
          <p className="text-[14px] text-[#DC2626]">{error}</p>
        )}
      </div>

      <Link
        href="/login"
        className="flex gap-[8px] items-center justify-center hover:text-[#404040] text-[#525252] transition-colors"
      >
        <ArrowLeft className="w-4 h-4 text-[#A3A3A3]" strokeWidth={1.67} />
        <span className="font-semibold leading-[20px] text-[14px]">Back to log in</span>
      </Link>
    </div>
  );
}
