/**
 * Consent for ad pixels (the optional ads add-on in packages/ads).
 *
 * In the EEA, the UK and Switzerland marketing cookies need opt-in consent,
 * so visitors there see a banner and nothing loads until they accept.
 * Elsewhere pixels load by default, unless the browser sends Global Privacy
 * Control or the visitor declines through "Cookie settings" in the footer.
 *
 * The region comes from the browser's time zone: no IP lookup, no request.
 * A missing or unknown time zone counts as a consent region.
 *
 * The choice is stored in the `opendocs_ads_consent` cookie for 12 months:
 * `granted` or `denied` when the visitor chose, `implied` outside consent
 * regions. The API reads the same cookie before sending server-side events.
 */

export const CONSENT_COOKIE = "opendocs_ads_consent";
export const CONSENT_CHANGE_EVENT = "opendocs:ads-consent-change";
export const OPEN_COOKIE_SETTINGS_EVENT = "opendocs:open-cookie-settings";

export type AdsConsent = "granted" | "denied" | "implied";

export const adsEnabled = process.env.NEXT_PUBLIC_AD_PIXELS_ENABLED === "true";

// Time zones outside `Europe/*` that belong to the EEA, the UK or
// Switzerland, plus legacy aliases browsers still report.
const CONSENT_TIME_ZONES = new Set([
  "Atlantic/Reykjavik", "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores",
  "Atlantic/Faroe", "Arctic/Longyearbyen", "Africa/Ceuta", "Asia/Nicosia",
  "Asia/Famagusta", "America/Guadeloupe", "America/Martinique", "America/Cayenne",
  "America/Marigot", "Indian/Reunion", "Indian/Mayotte",
  "Iceland", "GB", "GB-Eire", "Eire", "Portugal", "Poland", "CET", "EET", "WET", "MET",
]);

export function consentRequiredHere(): boolean {
  let timeZone: string | undefined;
  try {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return true;
  }
  if (!timeZone) return true;
  return timeZone.startsWith("Europe/") || CONSENT_TIME_ZONES.has(timeZone);
}

export function readConsent(): AdsConsent | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === CONSENT_COOKIE && (value === "granted" || value === "denied" || value === "implied")) {
      return value;
    }
  }
  return null;
}

export function writeConsent(value: AdsConsent) {
  const maxAge = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
  window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
}

function globalPrivacyControl(): boolean {
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/**
 * Whether pixels may load. Outside consent regions this also records the
 * `implied` choice, so server-side events can tell the visitor wasn't asked.
 */
export function adsAllowed(): boolean {
  if (!adsEnabled || typeof window === "undefined") return false;
  const consent = readConsent();
  if (consent) return consent !== "denied";
  if (consentRequiredHere() || globalPrivacyControl()) return false;
  writeConsent("implied");
  return true;
}

/** Whether the banner should ask: ads on, consent region, no choice yet. */
export function shouldAskForConsent(): boolean {
  return adsEnabled && readConsent() === null && consentRequiredHere();
}

export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));
}
