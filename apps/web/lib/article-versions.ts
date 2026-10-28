import {
  getPostVersionContent,
  listPostVersions,
} from "@opendocs/shared/posts/versions";

import { clientLabel } from "@/lib/client-labels";

export type ArticleVersionOption = {
  versionNumber: number;
  createdAtIso: string;
  /** e.g. "Oct 24, 2026" — formatted on the server so SSR and hydration agree. */
  createdAtLabel: string;
  createdBy: string | null;
  /** Friendly agent name ("Claude Code"), or null for CLI/web publishes. */
  agent: string | null;
  isCurrent: boolean;
  href: string;
};

export type ArticleVersionView = {
  versionNumber: number;
  createdAtLabel: string;
  renderedHtml: string;
  toc: Array<{ id: string; text: string; level: number }>;
  readingTime: string;
};

const dateLabel = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

/** First value of a `?v=` search param as a positive integer, else null. */
export function parseVersionParam(raw: string | string[] | undefined) {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{1,6}$/.test(value)) return null;
  const parsed = Number(value);
  return parsed > 0 ? parsed : null;
}

/**
 * Version history for the article page. Only workspace members see it
 * (`canViewHistory`): an older version may hold text the author removed
 * on purpose, so readers outside the workspace only ever get the live
 * version. When `requestedVersion` names an older version, its rendered
 * content is returned as `viewing`.
 */
export async function loadArticleVersions(input: {
  postId: string;
  postUrl: string;
  currentVersionNumber: number;
  canViewHistory: boolean;
  requestedVersion: number | null;
}): Promise<{ versions: ArticleVersionOption[]; viewing: ArticleVersionView | null }> {
  if (!input.canViewHistory) return { versions: [], viewing: null };

  const rows = await listPostVersions(input.postId);
  const versions = rows.map((row) => ({
    versionNumber: row.versionNumber,
    createdAtIso: row.createdAt.toISOString(),
    createdAtLabel: dateLabel.format(row.createdAt),
    createdBy: row.createdBy,
    agent: clientLabel(row.client),
    isCurrent: row.isCurrent,
    href: row.isCurrent ? input.postUrl : `${input.postUrl}?v=${row.versionNumber}`,
  }));

  const requested = input.requestedVersion;
  if (!requested || requested === input.currentVersionNumber) {
    return { versions, viewing: null };
  }
  const content = await getPostVersionContent(input.postId, requested);
  if (!content) return { versions, viewing: null };
  return {
    versions,
    viewing: {
      versionNumber: content.versionNumber,
      createdAtLabel: dateLabel.format(content.createdAt),
      renderedHtml: content.renderedHtml,
      toc: content.toc,
      readingTime: `${content.readingMinutes} min read`,
    },
  };
}
