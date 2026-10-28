import { getPostLinks } from "@opendocs/shared/custom-domains/service";
import { openDocsWebUrl } from "@opendocs/shared/custom-domains/urls";

/**
 * `publicUrl` is the absolute link the CLI and agents print and share: the
 * workspace's custom domain for public documents when it's active, the
 * opendocs.cc URL otherwise. Every response that returns a post's `url`
 * also returns `publicUrl`; `url` itself stays the relative opendocs.cc
 * path it always was.
 */

/** Adds `url` (when missing) and `publicUrl` to one post response. */
export async function withPublicUrl<T extends object & { url?: string }>(
  postId: string,
  body: T,
): Promise<T & { url: string; publicUrl: string }> {
  const links = (await getPostLinks([postId])).get(postId);
  const url = body.url ?? links?.url ?? "";
  return { ...body, url, publicUrl: links?.publicUrl ?? `${openDocsWebUrl()}${url}` };
}

/** Same for a list, with one query for all of it. */
export async function withPublicUrls<T extends object & { url?: string }>(
  items: T[],
  idOf: (item: T) => string,
): Promise<Array<T & { url: string; publicUrl: string }>> {
  const links = await getPostLinks(items.map(idOf));
  return items.map((item) => {
    const found = links.get(idOf(item));
    const url = item.url ?? found?.url ?? "";
    return { ...item, url, publicUrl: found?.publicUrl ?? `${openDocsWebUrl()}${url}` };
  });
}
