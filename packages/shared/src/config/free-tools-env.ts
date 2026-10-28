/**
 * Production overrides for the free tools' global thresholds, read from the
 * environment. Server side only (the API and the shared services it calls):
 * the web app imports free-tools.ts into the browser, so the env reading
 * lives here and not there.
 *
 * Each value is read on every call, so a deploy that changes deploy/.env and
 * recreates the API container picks it up, and tests can set and unset the
 * variables between requests. Unset, empty or invalid values (anything but
 * a whole number of at least 1) fall back to FREE_TOOL_LIMITS, so behavior
 * doesn't change unless a variable is set.
 */

import { FREE_TOOL_LIMITS } from "./free-tools";

export const FREE_TOOL_ENV = {
  /** FREE_TOOL_LIMITS.converter.global.perMinute */
  converterGlobalPerMinute: "FREE_CONVERTER_GLOBAL_PER_MINUTE",
  /** FREE_TOOL_LIMITS.converter.global.perHour */
  converterGlobalPerHour: "FREE_CONVERTER_GLOBAL_PER_HOUR",
  /** FREE_TOOL_LIMITS.anonymousPublish.global.perMinute */
  anonymousPublishGlobalPerMinute: "ANONYMOUS_PUBLISH_GLOBAL_PER_MINUTE",
  /** FREE_TOOL_LIMITS.anonymousPublish.global.perHour */
  anonymousPublishGlobalPerHour: "ANONYMOUS_PUBLISH_GLOBAL_PER_HOUR",
  /** FREE_TOOL_LIMITS.anonymousPublish.global.perDay */
  anonymousPublishGlobalPerDay: "ANONYMOUS_PUBLISH_GLOBAL_PER_DAY",
  /** FREE_TOOL_LIMITS.reports.hideAfterDistinctReporters */
  hideAfterDistinctReporters: "ANONYMOUS_REPORTS_HIDE_AFTER",
} as const;

const warned = new Set<string>();

function envThreshold(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (Number.isInteger(value) && value >= 1) return value;
  if (!warned.has(name)) {
    warned.add(name);
    console.warn(`[free-tools] Ignoring ${name}=${JSON.stringify(raw)}: expected a whole number >= 1; using ${fallback}.`);
  }
  return fallback;
}

/** The converter's global breaker (successful conversions across all clients). */
export function converterGlobalLimits(): { perMinute: number; perHour: number } {
  const { global } = FREE_TOOL_LIMITS.converter;
  return {
    perMinute: envThreshold(FREE_TOOL_ENV.converterGlobalPerMinute, global.perMinute),
    perHour: envThreshold(FREE_TOOL_ENV.converterGlobalPerHour, global.perHour),
  };
}

/** The anonymous-publish global breaker (new documents across all clients). */
export function anonymousPublishGlobalLimits(): { perMinute: number; perHour: number; perDay: number } {
  const { global } = FREE_TOOL_LIMITS.anonymousPublish;
  return {
    perMinute: envThreshold(FREE_TOOL_ENV.anonymousPublishGlobalPerMinute, global.perMinute),
    perHour: envThreshold(FREE_TOOL_ENV.anonymousPublishGlobalPerHour, global.perHour),
    perDay: envThreshold(FREE_TOOL_ENV.anonymousPublishGlobalPerDay, global.perDay),
  };
}

/** Distinct reporters (an IPv6 /56 counts as one) that hide an anonymous page. */
export function hideAfterDistinctReporters(): number {
  return envThreshold(FREE_TOOL_ENV.hideAfterDistinctReporters, FREE_TOOL_LIMITS.reports.hideAfterDistinctReporters);
}
