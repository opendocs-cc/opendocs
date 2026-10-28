"use client";

import { useEffect, useState } from "react";

import { AdScripts } from "@opendocs/ads/web";

import { CONSENT_CHANGE_EVENT, adsAllowed, adsEnabled } from "@/lib/ad-tracking/consent";
import { isOpenDocsBrowserHost } from "@/lib/browser-host";

/**
 * Loads the ads add-on's pixels (packages/ads) once consent allows it
 * (lib/ad-tracking/consent.ts), and again whenever the visitor changes their
 * choice.
 */
export function AdPixels() {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    // Never on a workspace's custom domain.
    if (!adsEnabled || !isOpenDocsBrowserHost()) return;
    const update = () => setAllowed(adsAllowed());
    update();
    window.addEventListener(CONSENT_CHANGE_EVENT, update);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, update);
  }, []);

  if (!allowed) return null;

  return <AdScripts />;
}
