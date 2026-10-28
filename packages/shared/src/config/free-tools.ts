/**
 * Limits for the no-account surfaces: the free converter
 * (`POST /api/v1/tools/convert/*`), anonymous publishing
 * (`POST /api/v1/anonymous/publish`) and reports on anonymous pages. The API
 * enforces them (apps/api/src/middleware/rate-limit.ts and the routes) and the
 * tool pages in apps/web read the size limits and the bot-check fields from
 * here, so the numbers live in one place.
 *
 * Who has to fit under them: one person using a tool page, an office or a
 * campus behind one address, and an agent running `opendocs publish
 * --anonymous` on a folder (10 files a run). What they stop: one script
 * hammering us (the per-IP limits) and many addresses at once (the global
 * limits, which fail closed with 503 so the converter keeps working for
 * signed-in exports and the database doesn't fill up).
 *
 * Every counter is in memory in the single API process (express-rate-limit's
 * MemoryStore), so a restart resets them and a second API instance would get
 * its own buckets. Move them to a shared store (Redis, Postgres) before
 * running more than one API instance.
 *
 * Tests lower or raise these at runtime (the limiters read them per request),
 * so keep this a plain mutable object.
 *
 * The global thresholds and `reports.hideAfterDistinctReporters` are the
 * defaults: production can override each through an environment variable
 * (./free-tools-env.ts, server side only) without a code change.
 */
export const FREE_TOOL_LIMITS = {
  converter: {
    /**
     * 2 MB per Markdown file or pasted text, the same for both. Hundreds of
     * pages of prose; anything bigger is usually base64 images.
     */
    maxBytes: 2 * 1024 * 1024,
    perIp: {
      /** Stops a script; a person converts one file every few seconds at most. */
      perMinute: 5,
      /** Stops a slow drip under the burst cap. */
      perHour: 30,
      /**
       * Without a daily cap one address could still take 720 a day (30 every
       * hour). 100 is a long day of real use, even for a shared office address.
       */
      perDay: 100,
    },
    /**
     * Across every address. Production runs one converter worker (one CPU,
     * deploy/docker-compose.yml) shared with signed-in exports, and a PDF
     * takes about a second, so it manages roughly 60 a minute. Free
     * conversions may use half of that in a burst (30 a minute) and a sixth
     * of it over an hour (600, about 10 a minute), which leaves room for
     * paying users even when a botnet spreads requests over thousands of
     * addresses. A busy launch day (a few thousand visitors an hour, one in
     * ten converting) stays well under both.
     */
    global: {
      perMinute: 30,
      perHour: 600,
    },
  },
  anonymousPublish: {
    /**
     * 512 KB of Markdown (UTF-8 bytes), smaller than signed-in documents
     * because nobody's storage quota pays for it, but enough for a long AI
     * chat published from the browser extension (raised from 256 KB in
     * October 2026).
     */
    maxBytes: 512_000,
    perIp: {
      /**
       * Publishes and updates together. An agent's folder run is 10 files;
       * someone sharing AI answers from the extension does a few an hour.
       */
      perHour: 30,
      /**
       * New documents only (updates are covered by the hourly cap). Ten
       * folder runs a day from one address, or a busy office sharing AI
       * answers; past that, sign up.
       */
      perDay: 100,
    },
    /**
     * Each document is a database row of up to 512 KB that lives for 24
     * hours, rendered on the API's single Node process. A launch spike
     * (a few hundred publishes an hour) fits easily. The daily cap bounds
     * what a botnet can store: 5,000 x 512 KB is about 2.6 GB at most (real
     * documents are a few KB), and it is deleted a day later.
     */
    global: {
      perMinute: 60,
      perHour: 1000,
      perDay: 5000,
    },
  },
  reports: {
    /** A reader reports one or two pages; more than this is someone gaming it. */
    perIp: {
      perHour: 5,
      perDay: 20,
    },
    /**
     * Reports from this many different addresses (an IPv6 /56 counts as one)
     * hide an anonymous page until the owner reviews it.
     */
    hideAfterDistinctReporters: 3,
    maxDetailsLength: 500,
  },
  botCheck: {
    /**
     * A hidden form field that people never see or fill. Bots that fill
     * every input give themselves away; the API rejects the request with a
     * generic message.
     */
    honeypotField: "website",
    /** Milliseconds between the form appearing and being sent, from the page. */
    elapsedField: "elapsed_ms",
    /**
     * Faster than a person can read the page and click. A person who does
     * trip it just clicks again a moment later. Only checked when the page
     * sends the field, so API and CLI callers are unaffected.
     */
    minElapsedMs: 1000,
  },
};

/**
 * Tool slugs that tag the footer link in free exports
 * (`utm_content=<slug>`), so we can see which tool a reader came from.
 * Anything else is tagged `free-converter`.
 */
export const FREE_TOOL_SLUGS = [
  "markdown-to-pdf",
  "markdown-to-word",
  "markdown-to-docx",
  "publish-markdown-online",
  "chatgpt-to-pdf",
  "readme-to-pdf",
  "markdown-table-to-word",
] as const;

export type FreeToolSlug = (typeof FREE_TOOL_SLUGS)[number];

export const DEFAULT_FREE_TOOL_SLUG = "free-converter";

export function freeToolSlug(value: unknown): FreeToolSlug | typeof DEFAULT_FREE_TOOL_SLUG {
  return typeof value === "string" && (FREE_TOOL_SLUGS as readonly string[]).includes(value)
    ? (value as FreeToolSlug)
    : DEFAULT_FREE_TOOL_SLUG;
}

/** Reasons a reader can give when reporting an anonymous page. */
export const ANONYMOUS_REPORT_REASONS = {
  spam: "Spam",
  phishing: "Phishing or a scam",
  malware: "Malware or a harmful download",
  illegal: "Illegal content",
  personal: "Someone's private information",
  other: "Something else",
} as const;

export type AnonymousReportReason = keyof typeof ANONYMOUS_REPORT_REASONS;
