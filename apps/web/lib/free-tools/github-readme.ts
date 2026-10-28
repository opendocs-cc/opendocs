/**
 * Fetches a README for the README to PDF tool, in the browser, straight from
 * GitHub (api.github.com and raw.githubusercontent.com both allow CORS).
 * Nothing goes through our servers, so there's no request forgery surface:
 * the API never fetches a URL a visitor typed.
 *
 * Only well-formed github.com locations are accepted: `owner/repo`, a repo
 * URL (optionally `/tree/<ref>/<dir>`), or a `/blob/<ref>/<file>.md` or
 * raw.githubusercontent.com link to one Markdown file.
 */

export type GithubLocation =
  | { kind: "repo"; owner: string; repo: string; ref?: string; dir?: string }
  | { kind: "file"; owner: string; repo: string; ref: string; path: string };

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const SEGMENT = /^[A-Za-z0-9._@+-]{1,255}$/;

function validSegments(segments: string[]) {
  return segments.every((segment) => SEGMENT.test(segment) && segment !== "." && segment !== "..");
}

export function parseGithubLocation(input: string): GithubLocation | null {
  let value = input.trim();
  if (!value) return null;

  // owner/repo shorthand
  if (/^[A-Za-z0-9-]+\/[^/\s:]+$/.test(value)) {
    value = `https://github.com/${value}`;
  } else if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();

  let segments: string[];
  try {
    segments = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return null;
  }

  if (host === "raw.githubusercontent.com") {
    const [owner, repo, ref, ...rest] = segments;
    if (!owner || !repo || !ref || rest.length === 0) return null;
    if (!OWNER.test(owner) || !REPO.test(repo) || !validSegments([ref, ...rest])) return null;
    const path = rest.join("/");
    if (!/\.(md|markdown)$/i.test(path)) return null;
    return { kind: "file", owner, repo, ref, path };
  }

  if (host !== "github.com" && host !== "www.github.com") return null;
  const [owner, rawRepo, kind, ref, ...rest] = segments;
  if (!owner || !rawRepo) return null;
  const repo = rawRepo.replace(/\.git$/i, "");
  if (!OWNER.test(owner) || !REPO.test(repo) || repo === "." || repo === "..") return null;

  if (!kind) return { kind: "repo", owner, repo };
  if (!ref || !validSegments([ref, ...rest])) return null;
  if (kind === "tree") {
    return { kind: "repo", owner, repo, ref, dir: rest.length ? rest.join("/") : undefined };
  }
  if (kind === "blob" && rest.length > 0) {
    const path = rest.join("/");
    if (!/\.(md|markdown)$/i.test(path)) return null;
    return { kind: "file", owner, repo, ref, path };
  }
  return null;
}

export class ReadmeFetchError extends Error {}

const path = (...parts: string[]) => parts.map(encodeURIComponent).join("/");
const dirOf = (filePath: string) => (filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "");

function decodeBase64Utf8(content: string) {
  const binary = atob(content.replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8").decode(bytes);
}

/**
 * Relative image and link targets in a README point into the repository;
 * once the text leaves GitHub they'd break, so point them at GitHub
 * (images at raw.githubusercontent.com, links at github.com).
 */
export function absolutizeReadmeLinks(
  markdown: string,
  base: { owner: string; repo: string; ref: string; dir: string },
) {
  const repoPath = `${path(base.owner, base.repo)}/${encodeURIComponent(base.ref)}/`;
  const rawRoot = `https://raw.githubusercontent.com/${repoPath}`;
  const htmlRoot = `https://github.com/${path(base.owner, base.repo)}/blob/${encodeURIComponent(base.ref)}/`;
  const resolve = (target: string, image: boolean) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) return target;
    const root = image ? rawRoot : htmlRoot;
    try {
      return target.startsWith("/") ? new URL(target.slice(1), root).href : new URL(target, root + base.dir).href;
    } catch {
      return target;
    }
  };
  return markdown
    .replace(/(!?)\[([^\]\n]*)\]\(\s*<?([^\s)>]+)>?((?:\s+"[^"\n]*")?)\s*\)/g, (_m, bang, label, target, title) => {
      return `${bang}[${label}](${resolve(target, bang === "!")}${title})`;
    })
    .replace(/(<img\b[^>]*?\ssrc=)(["'])([^"']+)\2/gi, (_m, start, quote, target) => {
      return `${start}${quote}${resolve(target, true)}${quote}`;
    });
}

export async function fetchGithubReadme(
  location: GithubLocation,
  maxBytes: number,
): Promise<{ markdown: string; label: string }> {
  const repoLabel = `${location.owner}/${location.repo}`;
  let markdown: string;
  let ref: string;
  let filePath: string;

  if (location.kind === "file") {
    let res: Response;
    try {
      res = await fetch(
        `https://raw.githubusercontent.com/${path(location.owner, location.repo, location.ref)}/${location.path
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
      );
    } catch {
      throw new ReadmeFetchError("We couldn't reach GitHub. Check your connection, or paste the README below.");
    }
    if (res.status === 404) {
      throw new ReadmeFetchError("That file wasn't found. It may be in a private repository; paste it below instead.");
    }
    if (!res.ok) throw new ReadmeFetchError("GitHub didn't return that file. Paste it below instead.");
    markdown = await res.text();
    ref = location.ref;
    filePath = location.path;
  } else {
    const api = new URL(
      `https://api.github.com/repos/${path(location.owner, location.repo)}/readme${
        location.dir ? `/${location.dir.split("/").map(encodeURIComponent).join("/")}` : ""
      }`,
    );
    if (location.ref) api.searchParams.set("ref", location.ref);
    let res: Response;
    try {
      res = await fetch(api, { headers: { Accept: "application/vnd.github+json" } });
    } catch {
      throw new ReadmeFetchError("We couldn't reach GitHub. Check your connection, or paste the README below.");
    }
    if (res.status === 404) {
      throw new ReadmeFetchError(
        `No README found for ${repoLabel}. Check the name; private repositories can't be fetched, so paste it below instead.`,
      );
    }
    if (res.status === 403 || res.status === 429) {
      throw new ReadmeFetchError(
        "GitHub limits fetches without an account to 60 an hour per address, and that's used up. Paste the README below instead.",
      );
    }
    if (!res.ok) throw new ReadmeFetchError("GitHub didn't return the README. Paste it below instead.");
    const body = (await res.json()) as {
      content?: string;
      encoding?: string;
      path?: string;
      size?: number;
      download_url?: string | null;
    };
    if (typeof body.size === "number" && body.size > maxBytes) {
      throw new ReadmeFetchError("That README is over 2 MB, too big for the free converter.");
    }
    if (body.encoding !== "base64" || typeof body.content !== "string") {
      throw new ReadmeFetchError("GitHub returned the README in a format we can't read. Paste it below instead.");
    }
    markdown = decodeBase64Utf8(body.content);
    filePath = body.path ?? "README.md";
    // download_url is raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>;
    // its ref is the branch GitHub actually served.
    const fromDownload = body.download_url
      ? /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/([^/]+)\//.exec(body.download_url)?.[1]
      : undefined;
    ref = location.ref ?? (fromDownload ? decodeURIComponent(fromDownload) : "HEAD");
  }

  if (new TextEncoder().encode(markdown).length > maxBytes) {
    throw new ReadmeFetchError("That README is over 2 MB, too big for the free converter.");
  }
  if (!markdown.trim()) throw new ReadmeFetchError("That README is empty.");

  return {
    markdown: absolutizeReadmeLinks(markdown, {
      owner: location.owner,
      repo: location.repo,
      ref,
      dir: dirOf(filePath),
    }),
    label: `${filePath.split("/").pop() ?? "README.md"} from ${repoLabel}`,
  };
}
