"use client";

import { useSearchParams } from "next/navigation";
import { startTransition, useState, Suspense } from "react";
import { Eye } from "lucide-react";
import Link from "next/link";

function ResetPasswordFormInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const tokenError = searchParams.get("error");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [success, setSuccess] = useState(false);

  if (tokenError === "INVALID_TOKEN" || (!token && !success)) {
    return (
      <div className="w-full text-center py-4">
        <p className="font-semibold text-[#DC2626] text-[16px]">Invalid or expired link</p>
        <p className="text-[14px] text-[#525252] mt-2">
          This password reset link is no longer valid. Please request a new one.
        </p>
        <Link
          href="/forgot-password"
          className="inline-block mt-4 font-semibold text-[#6941c6] hover:text-[#53389E] text-[14px]"
        >
          Request new link
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="w-full text-center py-4">
        <p className="font-semibold text-[#171717] text-[16px]">Password updated</p>
        <p className="text-[14px] text-[#525252] mt-2">
          Your password has been reset. You can now sign in with your new password.
        </p>
        <Link
          href="/login"
          className="inline-block mt-4 font-semibold text-[#6941c6] hover:text-[#53389E] text-[14px]"
        >
          Sign in
        </Link>
      </div>
    );
  }

  const handleSubmit = () => {
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsPending(true);

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword: password, token: token! }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.message ?? "Unable to reset password.");
        }

        setSuccess(true);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Something went wrong. Please try again.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-[20px] w-full">
      <div className="flex flex-col gap-[6px] items-start w-full">
        <p className="font-medium leading-[20px] text-[#404040] text-[14px]">New password</p>
        <div className="bg-white relative rounded-[8px] w-full group">
          <div
            aria-hidden="true"
            className="absolute border border-[#d4d4d4] group-focus-within:border-[#6941c6] group-focus-within:ring-4 group-focus-within:ring-[#f4ebff] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-all"
          />
          <div className="flex flex-row items-center w-full relative z-10">
            <div className="flex gap-[8px] items-center px-[14px] py-[10px] w-full">
              <input
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 font-normal leading-[24px] bg-transparent outline-none text-[#171717] placeholder:text-[#737373] text-[16px] w-full"
              />
              <Eye className="w-4 h-4 shrink-0 text-[#A3A3A3]" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-[6px] items-start w-full">
        <p className="font-medium leading-[20px] text-[#404040] text-[14px]">Confirm password</p>
        <div className="bg-white relative rounded-[8px] w-full group">
          <div
            aria-hidden="true"
            className="absolute border border-[#d4d4d4] group-focus-within:border-[#6941c6] group-focus-within:ring-4 group-focus-within:ring-[#f4ebff] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-all"
          />
          <div className="flex flex-row items-center w-full relative z-10">
            <div className="flex gap-[8px] items-center px-[14px] py-[10px] w-full">
              <input
                type="password"
                placeholder="Type it again"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="flex-1 font-normal leading-[24px] bg-transparent outline-none text-[#171717] placeholder:text-[#737373] text-[16px] w-full"
              />
              <Eye className="w-4 h-4 shrink-0 text-[#A3A3A3]" />
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        disabled={isPending || !password || !confirmPassword}
        onClick={handleSubmit}
        className="relative rounded-[8px] w-full hover:bg-[#6941c6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
      >
        <div
          aria-hidden="true"
          className="absolute bg-[#7f56d9] inset-0 pointer-events-none rounded-[8px]"
        />
        <div className="flex flex-row items-center justify-center overflow-hidden rounded-[inherit] w-full relative z-10">
          <div className="flex gap-[6px] items-center justify-center px-[16px] py-[10px] w-full">
            <p className="font-semibold leading-[24px] text-[16px] text-white whitespace-nowrap">
              {isPending ? "Resetting..." : "Reset password"}
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
  );
}

export function ResetPasswordForm() {
  return (
    <Suspense>
      <ResetPasswordFormInner />
    </Suspense>
  );
}
