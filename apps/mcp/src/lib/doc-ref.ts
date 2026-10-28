/**
 * Documents can be named by their link (opendocs.cc or a workspace's custom
 * domain), their slug or their ID. Parsed here into the reference and the
 * optional workspace/project slugs the API needs to resolve a slug.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParsedDocRef = {
  ref: string;
  workspaceSlug?: string;
  projectSlug?: string;
};

export function parseDocRef(input: string, webHosts: string[]): ParsedDocRef {
  const raw = input.trim();
  if (UUID.test(raw)) return { ref: raw.toLowerCase() };

  let url: URL | null = null;
  if (/^https?:\/\//i.test(raw)) {
    try {
      url = new URL(raw);
    } catch {
      url = null;
    }
  } else if (/^(www\.)?opendocs\.cc\//i.test(raw)) {
    url = new URL(`https://${raw}`);
  }

  if (url) {
    const segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    const onOpenDocs = webHosts.includes(url.hostname.toLowerCase());
    if (onOpenDocs) {
      // /<workspace>/<slug> or /<workspace>/projects/<project>/<slug>
      if (segments.length >= 4 && segments[1] === "projects") {
        return { ref: segments[3]!, workspaceSlug: segments[0], projectSlug: segments[2] };
      }
      if (segments.length >= 2) return { ref: segments[1]!, workspaceSlug: segments[0] };
    } else {
      // Custom domain: /<slug> or /projects/<project>/<slug>
      if (segments.length >= 3 && segments[0] === "projects") {
        return { ref: segments[2]!, projectSlug: segments[1] };
      }
      if (segments.length >= 1) return { ref: segments[segments.length - 1]! };
    }
  }

  // A bare slug, or "workspace/slug".
  const parts = raw.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length === 2) return { ref: parts[1]!, workspaceSlug: parts[0] };
  return { ref: parts[parts.length - 1] ?? raw };
}
