"use client";

import { Github, Eye, EyeOff, CheckCircle2, Copy, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useState } from "react";

import { instanceWebUrl, isSelfHosted } from "@opendocs/shared/config/instance";

import { trackEvent } from "@/lib/analytics";
import { trackAdLead } from "@/lib/ad-tracking/client";
import { authClient } from "@/lib/auth-client";
import { authorizeUrlFromSignedQuery } from "@/lib/auth/oauth-flow";

type AuthActionsProps = {
  mode: "login" | "signup";
  providers: {
    github: boolean;
    google: boolean;
    email: boolean;
    /** Sign-in codes by email (needs email delivery). */
    emailCode: boolean;
  };
  /** Where to redirect after successful authentication (overrides defaults) */
  redirectUrl?: string | null;
  /**
   * Set when the page is part of an OAuth authorization (an app such as
   * Claude connecting over MCP): the signed query from the URL. After
   * sign-in the browser continues the authorization instead of going to
   * the dashboard.
   */
  oauthQuery?: string | null;
};

type FormState = {
  name: string;
  email: string;
  password: string;
};

const initialFormState: FormState = {
  name: "",
  email: "",
  password: "",
};

type EmbeddedBrowserInfo = {
  name: string;
};

function detectEmbeddedBrowser(userAgent: string): EmbeddedBrowserInfo | null {
  const ua = userAgent.toLowerCase();

  if (
    ua.includes("fb_iab") ||
    ua.includes("fban") ||
    ua.includes("fbav") ||
    ua.includes("fbios") ||
    ua.includes("fb4a") ||
    ua.includes("messenger")
  ) {
    return { name: "Facebook or Messenger" };
  }

  if (ua.includes("instagram")) return { name: "Instagram" };
  if (ua.includes("linkedinapp")) return { name: "LinkedIn" };
  if (ua.includes("twitter") || ua.includes("x-twitter")) return { name: "X" };
  if (ua.includes("tiktok")) return { name: "TikTok" };
  if (ua.includes("pinterest")) return { name: "Pinterest" };
  if (ua.includes("snapchat")) return { name: "Snapchat" };
  if (ua.includes("reddit")) return { name: "Reddit" };
  if (ua.includes("line/")) return { name: "LINE" };
  if (ua.includes("; wv)") || ua.includes("version/4.0 chrome")) {
    return { name: "this app" };
  }

  return null;
}

function GoogleInAppBrowserNotice({
  browserName,
  authUrl,
}: {
  browserName: string;
  authUrl: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="w-full rounded-[12px] border border-[#E9D7FE] bg-[#F9F5FF] p-4">
      <div className="flex flex-col gap-2">
        <p className="text-[14px] font-semibold leading-[20px] text-[#2E1C5C]">
          Google sign-in needs Safari or Chrome
        </p>
        <p className="text-[13px] leading-[20px] text-[#525252]">
          You are viewing OpenDocs inside {browserName}&apos;s in-app browser.
          Google blocks sign-in from this screen. Open this page in Safari,
          Chrome, or your phone&apos;s browser to continue with Google.
        </p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#d6c8f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#6941C6] shadow-sm transition-colors hover:bg-[#F4EBFF]"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={authUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-[8px] border border-[#d6c8f0] bg-white px-3 py-2 text-[13px] font-semibold text-[#6941C6] shadow-sm transition-colors hover:bg-[#F4EBFF]"
          >
            <ExternalLink className="h-4 w-4" />
            Open link
          </a>
        </div>
      </div>
    </div>
  );
}

function FormInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
  onKeyDown,
  passwordToggle,
  showPassword,
  onTogglePassword,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  passwordToggle?: boolean;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}) {
  const inputType = passwordToggle ? (showPassword ? "text" : "password") : type;

  return (
    <div className="flex flex-col gap-[6px] items-start w-full">
      <div className="flex gap-[2px] items-start">
        <p className="font-medium leading-[20px] text-[#404040] text-[14px] whitespace-nowrap">
          {label}
        </p>
      </div>
      <div className="bg-white relative rounded-[8px] w-full group">
        <div
          aria-hidden="true"
          className="absolute border border-[#d4d4d4] group-focus-within:border-[#6941c6] group-focus-within:ring-4 group-focus-within:ring-[#f4ebff] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] transition-all"
        />
        <div className="flex flex-row items-center w-full relative z-10">
          <div className="flex gap-[8px] items-center px-[14px] py-[10px] w-full">
            <input
              type={inputType}
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={onKeyDown}
              className="flex-1 font-normal leading-[24px] bg-transparent outline-none text-[#171717] placeholder:text-[#737373] text-[16px] w-full"
            />
            {passwordToggle && (
              <button
                type="button"
                onClick={onTogglePassword}
                className="shrink-0 text-[#A3A3A3] hover:text-[#525252] transition-colors cursor-pointer"
                aria-label={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PrimaryButton({
  text,
  onClick,
  disabled,
}: {
  text: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative rounded-[8px] w-full hover:bg-[#6941c6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div
        aria-hidden="true"
        className="absolute bg-[#7f56d9] inset-0 pointer-events-none rounded-[8px]"
      />
      <div className="flex flex-row items-center justify-center overflow-hidden rounded-[inherit] w-full relative z-10">
        <div className="flex gap-[6px] items-center justify-center px-[16px] py-[10px] w-full">
          <p className="font-semibold leading-[24px] text-[16px] text-white whitespace-nowrap">
            {text}
          </p>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
      <div
        aria-hidden="true"
        className="absolute border-2 border-[rgba(255,255,255,0.12)] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]"
      />
    </button>
  );
}

function GoogleButton({ text, onClick, disabled }: { text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative rounded-[8px] w-full hover:bg-gray-50 transition-colors disabled:opacity-60"
    >
      <div aria-hidden="true" className="absolute bg-white inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-row items-center justify-center overflow-hidden rounded-[inherit] w-full relative z-10">
        <div className="flex gap-[10px] items-center justify-center px-[16px] py-[10px] w-full">
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 20 20" fill="none">
            <path d="M19.6 10.23c0-.71-.06-1.39-.18-2.04H10v3.87h5.38a4.6 4.6 0 01-2 3.02v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.35z" fill="#4285F4"/>
            <path d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.04.95-3.39.95-2.6 0-4.81-1.76-5.6-4.12H1.07v2.58A9.996 9.996 0 0010 20z" fill="#34A853"/>
            <path d="M4.4 12.09A5.98 5.98 0 014.07 10c0-.72.12-1.43.33-2.09V5.33H1.07A9.996 9.996 0 000 10c0 1.61.39 3.14 1.07 4.49l3.33-2.4z" fill="#FBBC04"/>
            <path d="M10 3.96c1.47 0 2.79.5 3.82 1.5l2.87-2.87C14.96.99 12.7 0 10 0 6.09 0 2.71 2.24 1.07 5.51l3.33 2.4C5.19 5.55 7.4 3.96 10 3.96z" fill="#EA4335"/>
          </svg>
          <p className="font-semibold leading-[24px] text-[#404040] text-[16px] whitespace-nowrap">{text}</p>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
      <div aria-hidden="true" className="absolute border border-[#d4d4d4] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" />
    </button>
  );
}

function GithubButton({ text, onClick, disabled }: { text: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="relative rounded-[8px] w-full hover:bg-gray-50 transition-colors disabled:opacity-60"
    >
      <div aria-hidden="true" className="absolute bg-white inset-0 pointer-events-none rounded-[8px]" />
      <div className="flex flex-row items-center justify-center overflow-hidden rounded-[inherit] w-full relative z-10">
        <div className="flex gap-[10px] items-center justify-center px-[16px] py-[10px] w-full">
          <Github className="w-5 h-5 shrink-0 text-[#171717]" />
          <p className="font-semibold leading-[24px] text-[#404040] text-[16px] whitespace-nowrap">{text}</p>
        </div>
      </div>
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] shadow-[inset_0px_0px_0px_1px_rgba(0,0,0,0.18),inset_0px_-2px_0px_0px_rgba(0,0,0,0.05)]" />
      <div aria-hidden="true" className="absolute border border-[#d4d4d4] inset-0 pointer-events-none rounded-[8px] shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]" />
    </button>
  );
}

/** Where Better Auth wants the browser to go next, if the response says. */
function redirectTarget(data: unknown): string | null {
  if (data && typeof data === "object" && "url" in data) {
    const url = (data as { url?: unknown }).url;
    if (typeof url === "string" && url) return url;
  }
  return null;
}

export function AuthActions({ mode, providers, redirectUrl, oauthQuery }: AuthActionsProps) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState>(initialFormState);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [embeddedBrowser, setEmbeddedBrowser] =
    useState<EmbeddedBrowserInfo | null>(null);
  const [authUrl, setAuthUrl] = useState(`${instanceWebUrl()}/login`);
  // Passwordless: "email me a code" → paste the 6 digits. Creates the
  // account if the email is new, and marks the email verified (needed to
  // open documents shared with that address).
  // Inside an OAuth flow (connecting Claude, ChatGPT, …) the email code is
  // the quickest path, so start there.
  const [codeStep, setCodeStep] = useState<"off" | "email" | "code">(oauthQuery && providers.emailCode ? "email" : "off");
  const [code, setCode] = useState("");
  const [codeNotice, setCodeNotice] = useState<string | null>(null);

  // Determine where to go after auth succeeds
  const defaultPostAuthUrl = mode === "signup" ? "/onboarding" : "/dashboard";
  const postAuthUrl = oauthQuery
    ? authorizeUrlFromSignedQuery(oauthQuery)
    : redirectUrl || defaultPostAuthUrl;

  // After sign-in inside an OAuth flow, follow the server's next step
  // (consent screen or back to the app); fall back to the authorize URL.
  const continueOAuth = (data: unknown) => {
    window.location.href = redirectTarget(data) ?? postAuthUrl;
  };

  useEffect(() => {
    setEmbeddedBrowser(detectEmbeddedBrowser(window.navigator.userAgent));
    setAuthUrl(window.location.href);
  }, []);

  const handleEmailAuth = () => {
    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        if (mode === "signup") {
          const result = await authClient.signUp.email({
            email: formState.email,
            password: formState.password,
            name: formState.name,
            callbackURL: postAuthUrl,
          });

          if (result.error) {
            throw new Error(result.error.message ?? "Unable to create account.");
          }
          trackEvent("Signup", { method: "email" });
          trackAdLead("email");
          if (oauthQuery) return continueOAuth(result.data);
        } else {
          const result = await authClient.signIn.email({
            email: formState.email,
            password: formState.password,
            callbackURL: postAuthUrl,
          });

          if (result.error) {
            throw new Error(result.error.message ?? "Unable to sign in.");
          }
          trackEvent("Login", { method: "email" });
          if (oauthQuery) return continueOAuth(result.data);
        }

        router.push(postAuthUrl);
        router.refresh();
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const handleSendCode = () => {
    setError(null);
    setIsPending(true);
    startTransition(async () => {
      try {
        const result = await authClient.emailOtp.sendVerificationOtp({
          email: formState.email.trim(),
          type: "sign-in",
        });
        if (result.error) {
          throw new Error(result.error.message ?? "Unable to send a code.");
        }
        setCodeStep("code");
        setCodeNotice(`We sent a 6-digit code to ${formState.email.trim()}. It expires in 10 minutes.`);
      } catch (submissionError) {
        setError(
          submissionError instanceof Error ? submissionError.message : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  const handleVerifyCode = () => {
    setError(null);
    setIsPending(true);
    startTransition(async () => {
      try {
        const result = await authClient.signIn.emailOtp({
          email: formState.email.trim(),
          otp: code.replace(/\D/g, ""),
        });
        if (result.error) {
          throw new Error(
            result.error.message === "Invalid OTP"
              ? "That code isn't right. Check the latest email and try again."
              : (result.error.message ?? "Unable to verify the code."),
          );
        }
        trackEvent(mode === "signup" ? "Signup" : "Login", { method: "email_code" });
        if (mode === "signup") trackAdLead("email_code");
        if (oauthQuery) return continueOAuth(result.data);
        router.push(postAuthUrl);
        router.refresh();
      } catch (submissionError) {
        setError(
          submissionError instanceof Error ? submissionError.message : "Something went wrong.",
        );
      } finally {
        setIsPending(false);
      }
    });
  };

  if (codeStep !== "off") {
    return (
      <div className="flex flex-col gap-[24px] items-center w-full">
        <div className="flex flex-col gap-[20px] items-start w-full">
          <FormInput
            label="Email"
            placeholder="Enter your email"
            type="email"
            value={formState.email}
            onChange={(v) => {
              setFormState((s) => ({ ...s, email: v }));
              setCodeStep("email");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && codeStep === "email") {
                e.preventDefault();
                handleSendCode();
              }
            }}
          />
          {codeStep === "code" && (
            <FormInput
              label="Sign-in code"
              placeholder="123456"
              value={code}
              onChange={setCode}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleVerifyCode();
                }
              }}
            />
          )}
          {codeNotice && codeStep === "code" && (
            <p className="text-[14px] leading-[20px] text-[#525252]">{codeNotice}</p>
          )}
        </div>
        <div className="flex flex-col gap-[16px] items-start w-full">
          {codeStep === "email" ? (
            <PrimaryButton
              text={isPending ? "Sending..." : "Email me a code"}
              onClick={handleSendCode}
              disabled={isPending || !formState.email.includes("@")}
            />
          ) : (
            <PrimaryButton
              text={isPending ? "Checking..." : mode === "signup" ? "Create account" : "Sign in"}
              onClick={handleVerifyCode}
              disabled={isPending || code.replace(/\D/g, "").length !== 6}
            />
          )}
          <div className="flex w-full items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setCodeStep("off");
                setError(null);
              }}
              className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
            >
              Use a password instead
            </button>
            {codeStep === "code" && (
              <button
                type="button"
                onClick={handleSendCode}
                disabled={isPending}
                className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px] disabled:opacity-60"
              >
                Send a new code
              </button>
            )}
          </div>
        </div>
        {error && <p className="text-[14px] text-[#DC2626]">{error}</p>}
      </div>
    );
  }

  const handleSocialAuth = (provider: "google" | "github") => {
    setError(null);
    if (provider === "google" && embeddedBrowser) {
      setError(
        `Google sign-in is blocked inside ${embeddedBrowser.name}'s browser. Open this page in Safari or Chrome, then try again.`,
      );
      return;
    }
    setIsPending(true);

    startTransition(async () => {
      try {
        const result = await authClient.signIn.social({
          provider,
          callbackURL: postAuthUrl,
        });

        if (result.error) {
          throw new Error(result.error.message ?? `Unable to continue with ${provider}.`);
        }
        trackEvent(mode === "signup" ? "Signup" : "Login", { method: provider });
        if (mode === "signup") {
          trackAdLead(provider);
        }
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Something went wrong.",
        );
        setIsPending(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-[24px] items-center w-full">
      {/* Email form fields */}
      <div className="flex flex-col gap-[20px] items-start w-full">
        {mode === "signup" && (
          <FormInput
            label="Name"
            placeholder="Enter your name"
            value={formState.name}
            onChange={(v) => setFormState((s) => ({ ...s, name: v }))}
          />
        )}
        <FormInput
          label="Email"
          placeholder="Enter your email"
          type="email"
          value={formState.email}
          onChange={(v) => setFormState((s) => ({ ...s, email: v }))}
        />
        <div className="w-full flex flex-col gap-[6px]">
          <FormInput
            label="Password"
            placeholder={mode === "signup" ? "Create a password" : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"}
            value={formState.password}
            onChange={(v) => setFormState((s) => ({ ...s, password: v }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleEmailAuth();
              }
            }}
            passwordToggle
            showPassword={showPassword}
            onTogglePassword={() => setShowPassword((v) => !v)}
          />
          {mode === "signup" && (
            <div className="flex gap-[4px] items-center w-full text-[#525252]">
              <CheckCircle2 className="w-[15px] h-[15px] text-[#A3A3A3]" strokeWidth={1.5} />
              <p className="flex-1 font-normal leading-[20px] text-[14px]">Must be at least 8 characters.</p>
            </div>
          )}
        </div>
      </div>

      {/* Forgot password */}
      {mode === "login" && (
        <div className="flex items-center justify-end w-full">
          <Link
            href="/forgot-password"
            className="font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
          >
            Forgot password
          </Link>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-[16px] items-start w-full">
        <PrimaryButton
          text={isPending ? "Working..." : mode === "signup" ? "Get started" : "Sign in"}
          onClick={handleEmailAuth}
          disabled={
            isPending ||
            !providers.email ||
            !formState.email ||
            !formState.password ||
            (mode === "signup" && !formState.name)
          }
        />
        {providers.google && (
          <>
            {embeddedBrowser && (
              <GoogleInAppBrowserNotice
                browserName={embeddedBrowser.name}
                authUrl={authUrl}
              />
            )}
            <GoogleButton
              text={
                embeddedBrowser
                  ? "Google blocked in this browser"
                  : mode === "signup"
                    ? "Sign up with Google"
                    : "Sign in with Google"
              }
              onClick={() => handleSocialAuth("google")}
              disabled={isPending || Boolean(embeddedBrowser)}
            />
          </>
        )}
        {providers.github && (
          <GithubButton
            text={mode === "signup" ? "Sign up with GitHub" : "Sign in with GitHub"}
            onClick={() => handleSocialAuth("github")}
            disabled={isPending}
          />
        )}
        {providers.emailCode && (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setCodeStep("email");
            }}
            className="w-full text-center font-semibold leading-[20px] text-[#6941c6] hover:text-[#53389E] text-[14px]"
          >
            Email me a sign-in code instead
          </button>
        )}
      </div>

      {/* Terms notice for signup (opendocs.cc's terms; a self-hosted
          instance has its own, if any). */}
      {mode === "signup" && !isSelfHosted() && (
        <p className="font-normal leading-[20px] text-[#525252] text-[14px] text-center">
          By signing up you agree to our{" "}
          <Link href="/terms" className="text-[#6941c6] hover:text-[#53389E]">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-[#6941c6] hover:text-[#53389E]">
            Privacy Policy
          </Link>
          .
        </p>
      )}

      {/* Missing providers notice (opendocs.cc's; a self-hosted instance
          simply doesn't offer them) */}
      {!providers.google && !providers.github && !isSelfHosted() && (
        <p className="text-[14px] text-[#A3A3A3] text-center">
          Google and GitHub sign-in will become available as soon as the OAuth apps are finished.
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-[14px] text-[#DC2626]">{error}</p>
      )}
    </div>
  );
}
