import { eq, sql } from "drizzle-orm";

import { getDbOrThrow } from "../db/guards";
import { postVersions } from "../db/schema";
import { RENDERER_VERSION, renderMarkdown } from "../markdown/index";

type TocEntry = { id: string; text: string; level: number };

/** A stored version as the article and history views read it. */
export type StoredRendering = {
  versionId: string;
  rawMarkdown: string;
  renderedHtml: string;
  toc: TocEntry[] | null;
  sourceMetadata: Record<string, unknown> | null;
};

/** The renderer version a stored rendering was made with; 0 if unstamped. */
export function renderedWith(sourceMetadata: Record<string, unknown> | null): number {
  const value = sourceMetadata?.rendererVersion;
  return typeof value === "number" ? value : 0;
}

// Two reads of the same stale version (the article page loads the post for
// its metadata and its body) share one re-render.
const inFlight = new Map<string, Promise<{ renderedHtml: string; toc: TocEntry[] }>>();

/**
 * The version's HTML and table of contents, re-rendered from its stored
 * Markdown first when an older renderer made them. The re-render updates
 * that version in place: no new version, and the post's `updatedAt` stays
 * put, so readers only see the document pick up newer syntax (alerts,
 * math...). If rendering fails, the stored HTML is served as before.
 */
export async function currentRendering(
  stored: StoredRendering,
): Promise<{ renderedHtml: string; toc: TocEntry[] }> {
  if (renderedWith(stored.sourceMetadata) >= RENDERER_VERSION) {
    return { renderedHtml: stored.renderedHtml, toc: stored.toc ?? [] };
  }

  let pending = inFlight.get(stored.versionId);
  if (!pending) {
    pending = rerender(stored).finally(() => inFlight.delete(stored.versionId));
    inFlight.set(stored.versionId, pending);
  }
  try {
    return await pending;
  } catch (error) {
    console.error(`Re-rendering version ${stored.versionId} failed; serving the stored HTML.`, error);
    return { renderedHtml: stored.renderedHtml, toc: stored.toc ?? [] };
  }
}

async function rerender(stored: StoredRendering) {
  const rendered = await renderMarkdown(stored.rawMarkdown);
  await getDbOrThrow()
    .update(postVersions)
    .set({
      renderedHtml: rendered.html,
      toc: rendered.toc,
      // Merge, so the rest of the metadata (content hash, client...) stays.
      sourceMetadata: sql`coalesce(${postVersions.sourceMetadata}, '{}'::jsonb) || ${JSON.stringify({
        rendererVersion: RENDERER_VERSION,
      })}::jsonb`,
    })
    .where(eq(postVersions.id, stored.versionId));
  return { renderedHtml: rendered.html, toc: rendered.toc };
}
