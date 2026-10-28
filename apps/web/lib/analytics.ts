import { isOpenDocsBrowserHost } from "@/lib/browser-host";

const domain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;

let initialized = false;
let plausible: typeof import("@plausible-analytics/tracker") | null = null;

async function load() {
  if (plausible) return plausible;
  plausible = await import("@plausible-analytics/tracker");
  return plausible;
}

/**
 * Initialise Plausible. Safe to call more than once – only the first
 * call has any effect. Auto-pageviews are enabled by default.
 * Must be called from the browser (e.g. inside useEffect).
 */
export async function initAnalytics(): Promise<void> {
  if (initialized || !domain || typeof window === "undefined") return;
  // Never on a workspace's custom domain: those pages are the customer's.
  if (!isOpenDocsBrowserHost()) return;
  const { init } = await load();
  init({ domain, captureOnLocalhost: false });
  initialized = true;
}

/**
 * Fire a custom Plausible event.
 * No-ops when the domain env var is unset (dev / preview) or on the server.
 */
export async function trackEvent(
  name: string,
  props?: Record<string, string | number | boolean>,
): Promise<void> {
  if (!domain || typeof window === "undefined" || !isOpenDocsBrowserHost()) return;
  await initAnalytics();
  const { track } = await load();
  track(name, { props: props as Record<string, string> });
}
