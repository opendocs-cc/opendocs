import fs from "node:fs";
import path from "node:path";

// KaTeX's stylesheet and fonts for `$math$`; bundled by Next so the font
// URLs resolve.
import "katex/dist/katex.min.css";

import { DocArticleShell } from "@/components/doc-article-shell";
import type { PublicUserMenuData } from "@/components/public-user-menu";
import type {
  ArticleVersionOption,
  ArticleVersionView,
} from "@/lib/article-versions";

type DocArticleProps = {
  post: {
    /** Database ID of the post — used by the comments API. */
    id: string;
    /**
     * Whether the current viewer can leave inline comments. True only
     * when the viewer is an active member of the post's workspace.
     * Drives whether the commenting layer mounts at all.
     */
    canComment: boolean;
    workspaceSlug: string;
    projectSlug: string;
    projectName: string;
    isDefaultProject: boolean;
    url: string;
    workspaceName: string;
    workspaceLogoUrl: string | null;
    ownerUsername: string | null;
    title: string;
    summary: string;
    updatedAt: string;
    /**
     * Server-rendered "Last updated" trailer string. Always UTC; used
     * for SSR and the initial client paint. The client component
     * reformats this in the viewer's own locale on mount (12h vs 24h,
     * local timezone) when the post is within the recent window.
     */
    updatedAtDisplay: string;
    /** Raw ISO timestamp — client uses it to reformat in browser locale. */
    updatedAtIso: string;
    /**
     * Whether the post is recent enough (< 2 weeks) that the client
     * trailer should reformat the server string in the viewer's
     * locale. Older posts render just the date, for which locale
     * reformatting would add no value.
     */
    updatedAtIsRecent: boolean;
    readingTime: string;
    renderedHtml: string;
    /** Stored headings of the live version, for the table of contents. */
    toc: Array<{ id: string; text: string; level: number }>;
    tags: string[];
    /**
     * Workspace-wide first-seen tag ordering → color palette index.
     * Passed through to `DocArticleShell` so chips above the article
     * title pick the same color the same tag has on the workspace
     * profile page. See `lib/tag-colors.ts`.
     */
    tagColorIndex: Record<string, number>;
    /**
     * `true` when the workspace owner is on a paid tier — enables the
     * "Download DOCX" button on the article page. PDF is always
     * downloadable. Computed in `getPostByWorkspaceSlugAndPostSlug`.
     */
    canExportDocx: boolean;
    /**
     * Post slug (without workspace prefix). The download buttons need
     * this to build the public-export URL — `post.slug` isn't on the
     * view model today, so we pipe it through separately.
     */
    slug: string;
    /** Readable by anyone; decides how downloads work on custom domains. */
    isPublic: boolean;
  };
  isViewerSignedIn: boolean;
  userMenu?: PublicUserMenuData | null;
  /** Absolute API base URL, e.g. `https://api.opendocs.cc`. */
  apiBaseUrl: string;
  /**
   * Other workspace posts sharing at least one tag with the current
   * post, already access-filtered on the server. Piped straight through
   * to `DocArticleShell`, which renders the "Related documents" section
   * below the article body (or nothing, if the array is empty).
   */
  relatedPosts: Array<{
    workspaceSlug: string;
    projectSlug: string;
    isDefaultProject: boolean;
    url: string;
    tagBasePath: string;
    slug: string;
    title: string;
    updatedAt: string;
    readingTime: string;
    tags: string[];
  }>;
  /** Version history; empty unless the viewer is a workspace member. */
  versions: ArticleVersionOption[];
  /** Older version to show instead of the live one (`?v=N`). */
  viewingVersion: ArticleVersionView | null;
};

// Typography (headings, paragraphs, tables, blockquotes) and code-block
// highlighting for the rendered Markdown body live in the mkdocs Material
// stylesheets. The new shell replaces the mkdocs chrome (header/nav) but
// still wraps the article in `.md-typeset`, so these stylesheets continue
// to provide the in-body styling — including the hover-visible "¶" heading
// permalinks and the rehype-pretty-code syntax highlighting.
//
// `main.min.css` contains three global `html { font-size: 125% | 137.5% |
// 150% }` rules (the middle two fire at wider breakpoints) that mkdocs uses
// to inflate its own typography. On our app those rules cascade into the
// Next.js navbar and blow up every Tailwind `rem`-based size — `h-10`,
// `px-4`, `text-sm` — so the Dashboard button and search chip render ~25%
// larger on the article page than on the workspace profile page. Strip the
// three rules before injection; the navbar now renders identically on both
// pages, and article body typography (`.md-typeset`) still reads fine at
// the browser default 16px root.
const mkdocsMainCss = fs
  .readFileSync(
    path.join(process.cwd(), "public/mkdocs/assets/stylesheets/main.484c7ddc.min.css"),
    "utf8",
  )
  // MkDocs Material ships page-level rules for `body`/`input`/`aside`.
  // Injecting them into the article route after Tailwind means they can
  // leak into the OpenDocs chrome (header buttons, tag chips, etc.).
  // Keep the Markdown-scoped `.md-typeset` rules, but strip the global
  // page color/background rules so the app shell stays in charge.
  .replace(
    /body\{-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;--md-text-font-family:var\(--md-text-font,_\),-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;--md-code-font-family:var\(--md-code-font,_\),SFMono-Regular,Consolas,Menlo,monospace\}/g,
    ":root{--md-text-font-family:var(--md-text-font,_),-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;--md-code-font-family:var(--md-code-font,_),SFMono-Regular,Consolas,Menlo,monospace}",
  )
  .replace(
    /aside,body,input\{font-feature-settings:"kern","liga";color:var\(--md-typeset-color\);font-family:var\(--md-text-font-family\)\}/g,
    "aside,input{font-feature-settings:\"kern\",\"liga\";font-family:var(--md-text-font-family)}",
  )
  .replace(
    /body\{background-color:var\(--md-default-bg-color\);display:flex;flex-direction:column;font-size:\.5rem;min-height:100%;position:relative;width:100%\}/g,
    "",
  )
  // The first html rule also sets `height:100%;overflow-x:hidden`, which
  // makes <html> the scroll container instead of the viewport. Scroll
  // locks (search dialog, menus) set `overflow:hidden` on <body>, which
  // then neither stops scrolling nor keeps the sticky header in place:
  // the page could scroll behind the search dialog, menus opened far off
  // screen and the page shifted sideways. Drop the whole rule; the
  // article layout clips horizontal overflow itself.
  .replace(/html\{font-size:125%;height:100%;overflow-x:hidden\}/g, "")
  .replace(/html\{font-size:137\.5%\}/g, "")
  .replace(/html\{font-size:150%\}/g, "")
  // Defense-in-depth for any future MkDocs body block shape. The app
  // route owns `<body>`; Markdown CSS should only style `.md-typeset`.
  .replace(/;font-size:\.5rem;/g, ";")
  // MkDocs also resets every `<a>`, `<button>` and `<input>` (inherited
  // link color, transparent buttons without padding, borderless inputs).
  // This stylesheet is unlayered, so those resets beat Tailwind's layered
  // utilities and broke link colors and buttons in the page chrome; scope
  // them to the rendered Markdown.
  .replace(/(^|\})a\{color:inherit;/g, "$1.md-typeset a{color:inherit;")
  .replace(
    /(^|\})button\{background:#0000;/g,
    "$1.md-typeset button{background:#0000;",
  )
  .replace(/(^|\})input\{border:0;/g, "$1.md-typeset input{border:0;");

const mkdocsPaletteCss = fs.readFileSync(
  path.join(process.cwd(), "public/mkdocs/assets/stylesheets/palette.ab4e12ef.min.css"),
  "utf8",
);

const mkdocsBearCss = fs
  .readFileSync(
    path.join(process.cwd(), "public/mkdocs/stylesheets/bear.css"),
    "utf8",
  )
  // Bear's body typography is useful for rendered Markdown, but not
  // for the app shell. Scope that one global block to the article body.
  .replace(/body\s*\{([\s\S]*?)\n\}/, ".od-mkdocs {$1\n}");

const mkdocsPatchCss = fs.readFileSync(
  path.join(process.cwd(), "public/mkdocs/stylesheets/opendocs-mkdocs.css"),
  "utf8",
);

// Alerts, figures, math, highlights and the rest of OpenDocs' Markdown
// dialect; loaded last so it refines the sheets above.
const markdownCss = fs.readFileSync(
  path.join(process.cwd(), "public/mkdocs/stylesheets/opendocs-markdown.css"),
  "utf8",
);

/** The Markdown body stylesheets, for pages that render `.md-typeset` HTML. */
export function DocMarkdownStyles() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: mkdocsMainCss }} />
      <style dangerouslySetInnerHTML={{ __html: mkdocsPaletteCss }} />
      <style dangerouslySetInnerHTML={{ __html: mkdocsBearCss }} />
      <style dangerouslySetInnerHTML={{ __html: mkdocsPatchCss }} />
      <style dangerouslySetInnerHTML={{ __html: markdownCss }} />
    </>
  );
}

export function DocArticle({
  post,
  isViewerSignedIn,
  userMenu = null,
  apiBaseUrl,
  relatedPosts,
  versions,
  viewingVersion,
}: DocArticleProps) {
  return (
    <>
      <DocMarkdownStyles />
      <DocArticleShell
        post={post}
        isViewerSignedIn={isViewerSignedIn}
        userMenu={userMenu}
        apiBaseUrl={apiBaseUrl}
        relatedPosts={relatedPosts}
        versions={versions}
        viewingVersion={viewingVersion}
      />
    </>
  );
}
