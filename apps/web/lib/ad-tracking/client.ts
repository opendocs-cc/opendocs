"use client";

import * as ads from "@opendocs/ads/web";

import { adsAllowed } from "./consent";

function eventId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

export function trackAdLead(method: string): void {
  if (!adsAllowed()) return;
  ads.trackLead(method);
}

/** Returns the event's ID (shared with the server-side event), or null when ads can't run. */
export function trackAdRegistration(
  id = eventId("registration"),
): string | null {
  if (!adsAllowed()) return null;
  ads.trackRegistration(id);
  return id;
}

export function trackAdCheckoutStarted(input: {
  plan: string;
  cycle: string;
}): string | null {
  if (!adsAllowed()) return null;
  const id = eventId("checkout");
  ads.trackCheckoutStarted(id, input);
  return id;
}

export function trackAdPurchase(input: {
  eventId?: string;
  value?: number;
  currency?: string;
}): string | null {
  if (!adsAllowed()) return null;
  const id = input.eventId ?? eventId("purchase");
  ads.trackPurchase(id, { value: input.value, currency: input.currency ?? "USD" });
  return id;
}
