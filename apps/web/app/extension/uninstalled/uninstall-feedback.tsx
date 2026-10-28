"use client";

import { useState } from "react";

import { API_BASE_URL } from "@/lib/config/api";

const REASONS = [
  { value: "broken", label: "It didn't work on a chat site" },
  { value: "formatting", label: "The document or PDF didn't look right" },
  { value: "privacy", label: "I had privacy worries" },
  { value: "not_needed", label: "I don't need it" },
  { value: "other", label: "Something else" },
] as const;

type State = "idle" | "sending" | "sent" | "error";

export function UninstallFeedback() {
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<State>("idle");

  async function send(event: React.FormEvent) {
    event.preventDefault();
    if (!reason) return;
    setState("sending");
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/extension/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, details: details.trim() || undefined }),
      });
      setState(res.ok || res.status === 429 ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p role="status" className="rounded-2xl bg-[#F4F0FD] px-5 py-4 text-[15px] leading-relaxed text-[#3E2384]">
        Thanks for telling us. We read every answer.
      </p>
    );
  }

  return (
    <form onSubmit={send} className="space-y-6">
      <fieldset>
        <legend className="text-[15px] font-semibold text-zinc-950">Why did you remove it?</legend>
        <div className="mt-3 grid gap-2">
          {REASONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3 text-[15px] ring-1 transition ${
                reason === option.value ? "bg-[#F4F0FD] text-zinc-950 ring-[#6B3FC9]/40" : "bg-white text-zinc-700 ring-zinc-200 hover:ring-zinc-300"
              }`}
            >
              <input
                type="radio"
                name="reason"
                value={option.value}
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
                className="h-4 w-4 accent-[#6B3FC9]"
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-2">
        <label htmlFor="details" className="text-[15px] font-semibold text-zinc-950">
          Anything we should fix? <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <textarea
          id="details"
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={500}
          rows={3}
          className="w-full rounded-xl bg-white px-4 py-3 text-[15px] text-zinc-900 ring-1 ring-zinc-300 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#6B3FC9]/50"
        />
        <p className="text-sm text-zinc-500">Please don&apos;t include anything private. Up to 500 characters.</p>
      </div>

      {state === "error" ? (
        <p role="alert" className="text-sm text-red-700">
          That didn&apos;t send. Try again in a moment.
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!reason || state === "sending"}
        className="inline-flex items-center rounded-xl bg-[#6B3FC9] px-5 py-2.5 text-[15px] font-semibold text-white transition hover:bg-[#5B33B0] active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-600"
      >
        {state === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
