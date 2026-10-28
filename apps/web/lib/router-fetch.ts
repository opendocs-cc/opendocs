/**
 * Whether a request is the Next router fetching a page in the background
 * (client-side navigation or prefetch) rather than the browser loading it.
 *
 * The sign-in bridge must only run as real page loads: a background fetch
 * would follow its redirects invisibly, mint and spend the one-time code,
 * and clear the state cookie before the visible navigation gets there.
 * Answering such a fetch with a plain (non-RSC) response makes the router
 * fall back to a full page load of the same URL.
 */
export function isRouterFetch(request: Request): boolean {
  const headers = request.headers;
  // Next strips its RSC headers before route handlers but keeps the `_rsc`
  // cache-busting parameter; browsers also mark fetches as non-documents.
  if (new URL(request.url).searchParams.has("_rsc")) return true;
  if (headers.has("rsc") || headers.has("next-router-prefetch") || headers.has("next-router-state-tree")) {
    return true;
  }
  const dest = headers.get("sec-fetch-dest");
  return Boolean(dest) && dest !== "document";
}

export function fullPageLoadResponse(): Response {
  return new Response("Continue in the browser.", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
