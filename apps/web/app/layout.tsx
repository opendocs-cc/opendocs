import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";

import { siteConfig } from "@opendocs/shared/config/site";

import { AnalyticsProvider } from "@/components/analytics-provider";
import { AdPixels } from "@/components/ad-pixels";
import { CookieBanner } from "@/components/cookie-banner";
import { TWITTER_HANDLE } from "@/lib/metadata";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s · ${siteConfig.name}`,
  },
  description: siteConfig.description,
  // Favicon / app-icon set. Next.js 15 auto-generates the `<link>` tags
  // from this config and serves the images from `/public`. The PNG is
  // reused for the Apple touch icon — it's a flat mark that survives
  // iOS's rounded-corner + reflection treatment fine at 180×180.
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
  },
  // Root-level openGraph / twitter fallbacks. Inherited by any page that
  // doesn't export its own openGraph (Next.js 15 does NOT deeply merge
  // openGraph across segments — child's value replaces the parent's
  // wholesale — so every page with a custom openGraph must restate the
  // og:image. See `lib/metadata.ts` for the helper that does that.)
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: siteConfig.name,
    description: siteConfig.description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: siteConfig.name,
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: TWITTER_HANDLE,
    creator: TWITTER_HANDLE,
    title: siteConfig.name,
    description: siteConfig.description,
    images: ["/og-image.png"],
  },
};

/**
 * Site-wide JSON-LD structured data. Two entities, emitted on every
 * page via the root layout:
 *
 *   - `Organization` — powers Google's knowledge-panel card and ties
 *     our brand name to our logo + social presence.
 *   - `WebSite` — declares the canonical site name so Google's SERP
 *     header doesn't fall back to the root hostname. We deliberately
 *     skip `potentialAction: SearchAction` because there's no
 *     site-wide search URL yet; adding a fake one would violate
 *     Google's guidelines.
 *
 * Google's own guidance allows (and expects) site-wide structured
 * data on every page as long as it describes the site, not the
 * current document — which is exactly what these two entities do.
 * Per-page Article schema lives on the individual doc pages.
 */
const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: siteConfig.name,
  url: siteConfig.url,
  // Square brand mark — Google's knowledge-panel card renders the
  // logo at ~112×112, so a horizontal wordmark / 1200×630 og-image
  // would render as a tiny letterboxed strip. The dedicated icon
  // reads cleanly at that size.
  logo: `${siteConfig.url}/opendocs-article-icon.png`,
  sameAs: ["https://x.com/opendocshq"],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteConfig.name,
  url: siteConfig.url,
  description: siteConfig.description,
};

const themeBootScript = `
(() => {
  const apply = (isDark) => {
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  };
  try {
    const storageKey = "opendocs-theme";
    const stored = localStorage.getItem(storageKey);
    // Light unless the reader picked Dark or System in the theme menu.
    const theme = stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = theme === "dark" || (theme === "system" && prefersDark);
    apply(isDark);
  } catch {
    // localStorage can be unavailable in strict privacy contexts: light.
    apply(false);
  }
})();
`;

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${jetbrainsMono.variable}`}>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {/*
         * JSON-LD scripts — rendered into <body> rather than <head>
         * because Next.js' App Router doesn't expose a <head>
         * element here and inline <script type="application/ld+json">
         * is valid anywhere in the document per the HTML spec.
         * `dangerouslySetInnerHTML` is the standard pattern for
         * JSON-LD in React: we need literal JSON content, not React
         * children. The content is a plain object we control (no
         * user input), so the XSS surface is nil.
         */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd),
          }}
        />
        <AnalyticsProvider />
        <AdPixels />
        {children}
        <CookieBanner />
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
