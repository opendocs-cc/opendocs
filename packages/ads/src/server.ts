/**
 * Server side of the optional ads add-on: conversion events sent from the
 * API, for when the browser blocks the pixels. This placeholder does nothing;
 * production builds replace this package with a private one (see
 * packages/ads/README.md). Implementations only send an event when the
 * request's consent cookie allows ads.
 */

export type ConversionRequest = {
  ip?: string | null;
  userAgent?: string | null;
  /** The request's cookies: the consent cookie and any ad click IDs. */
  cookies?: Record<string, string>;
};

export type SignupConversion = {
  /** Shared with the browser event, for deduplication. */
  eventId: string;
  email: string;
  userId: string;
  status: string;
};

export type PurchaseConversion = {
  eventId: string;
  email: string;
  userId: string;
  plan?: string;
  cycle?: string;
  seats?: number;
  subscriptionId?: string;
  value?: number;
  currency?: string;
};

export async function trackSignupConversion(
  _conversion: SignupConversion,
  _request: ConversionRequest,
): Promise<void> {}

export async function trackPurchaseConversion(
  _conversion: PurchaseConversion,
  _request: ConversionRequest = {},
): Promise<void> {}
