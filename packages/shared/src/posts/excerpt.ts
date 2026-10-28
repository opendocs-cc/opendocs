/**
 * Derive a human-readable excerpt from raw Markdown for previews
 * (workspace profile cards, meta descriptions, OpenGraph summaries).
 *
 * The earlier implementation was a one-liner that stripped a single H1
 * and took the first non-empty line. In practice that produced terrible
 * previews: many docs open with a frontmatter-ish "document control"
 * table (`| Status | Approved | …`), a banner image, or an H2 section
 * header — any of which would leak into the excerpt as the raw
 * Markdown source (`| Status | ...`, `![banner](...)`, `## Overview`).
 *
 * This pass walks the markdown line-by-line and returns the first
 * paragraph that looks like actual prose, skipping:
 *   - YAML frontmatter (`--- ... ---` at the top)
 *   - ATX headings (`# / ## / ### / ...`)
 *   - Setext headings (text followed by `===` or `---`)
 *   - GFM tables (any line starting with `|`)
 *   - Fenced code blocks (``` ... ``` / ~~~ ... ~~~)
 *   - Blockquotes (lines starting with `>`)
 *   - HTML blocks (lines starting with `<`)
 *   - Horizontal rules (`---`, `***`, `___`)
 *   - Image-only paragraphs (`![alt](url)` with nothing else)
 *   - HTML comments (`<!-- ... -->`)
 *
 * Inline Markdown (bold/italic/strikethrough/links/images/inline code)
 * is then flattened to plain text so the stored excerpt doesn't show
 * escaped symbols like `**bold**` or `[text](url)`.
 *
 * We deliberately don't plug into `unified()`/`remark-parse` here — the
 * extractor runs on every publish/update and on every profile page
 * render, and a tight string-based pass is orders of magnitude cheaper
 * than spinning up a full Markdown pipeline just to find one paragraph.
 */
export function extractMarkdownExcerpt(
  rawMarkdown: string | null | undefined,
  maxLength = 280,
): string {
  if (!rawMarkdown) return "";

  // Normalize line endings; strip frontmatter, fenced code, HTML comments.
  let src = rawMarkdown.replace(/\r\n/g, "\n");

  // YAML frontmatter: only when it's literally at the top of the doc.
  if (/^---[ \t]*\n/.test(src)) {
    const close = src.search(/\n---[ \t]*(?:\n|$)/);
    if (close !== -1) {
      const afterClose = src.indexOf("\n", close + 1);
      src = afterClose === -1 ? "" : src.slice(afterClose + 1);
    }
  }

  // Fenced code blocks — both ``` and ~~~, optionally indented up to 3 sp.
  src = src.replace(
    /^[ \t]{0,3}(```|~~~)[^\n]*\n[\s\S]*?^[ \t]{0,3}\1[ \t]*$/gm,
    "",
  );

  // HTML comments.
  src = src.replace(/<!--[\s\S]*?-->/g, "");

  const lines = src.split("\n");
  const current: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? "";

    // Blank line — close out the current paragraph if we have one.
    if (!line) {
      if (current.length > 0) {
        return finish(current.join(" "), maxLength);
      }
      continue;
    }

    // Setext heading: "Title line\n===" or "Title line\n---". Only
    // recognized when we're at a paragraph boundary (current empty),
    // matching CommonMark's rule that the underline must directly follow
    // the heading text.
    if (
      current.length === 0 &&
      (/^=+$/.test(next) || /^-+$/.test(next))
    ) {
      i++; // skip the underline line too
      continue;
    }

    if (isNonProseLine(line)) {
      if (current.length > 0) {
        return finish(current.join(" "), maxLength);
      }
      continue;
    }

    // Strip a leading list marker so that docs that are *only* bullets
    // (recipes, reference cards, todo lists) read naturally as prose —
    // "Flour Sugar Eggs" instead of "- Flour - Sugar - Eggs". Prose
    // that merely *contains* a dash mid-line isn't affected.
    current.push(line.replace(/^(?:[-*+]|\d+[.)])[ \t]+/, ""));
  }

  if (current.length > 0) {
    return finish(current.join(" "), maxLength);
  }
  return "";
}

/**
 * Line-level skip rules. We check single lines (not blocks) because
 * authors occasionally forget blank separators between a heading and
 * the paragraph that follows — walking line-by-line lets us keep the
 * paragraph even when the heading is glued to it.
 */
function isNonProseLine(line: string): boolean {
  // ATX heading
  if (/^#{1,6}\s/.test(line)) return true;

  // Table row (GFM pipe tables)
  if (line.startsWith("|")) return true;

  // Blockquote
  if (line.startsWith(">")) return true;

  // HTML block — a line starting with a tag (but not a processing
  // instruction or declaration). The sanitizer strips HTML at render
  // time, but the raw markdown still has it.
  if (/^<[a-zA-Z/]/.test(line)) return true;

  // Horizontal rule: three or more of the same char (-, *, _), possibly
  // with spaces between. `***`, `---`, `- - -`, `___` all qualify.
  if (/^([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) return true;

  // Image-only line: `![alt](url)` possibly wrapped in a link.
  if (/^\[?!\[[^\]]*\]\([^)]+\)\]?(?:\([^)]+\))?\s*$/.test(line)) {
    return true;
  }

  return false;
}

function flattenInlineMarkdown(s: string): string {
  return (
    s
      // Strip images outright (alt text is usually structural: "Logo", "Banner").
      .replace(/!\[[^\]]*\]\([^)]+\)/g, "")
      // Links → keep just the anchor text.
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      // Bold (**x** / __x__) and italic (*x* / _x_). Keep simple — we don't
      // need to handle every CommonMark edge case for a preview.
      .replace(/(\*\*|__)(.+?)\1/g, "$2")
      .replace(/(?<![*_\w])([*_])([^*_\n]+?)\1(?![*_\w])/g, "$2")
      // Strikethrough.
      .replace(/~~([^~]+)~~/g, "$1")
      // Inline code.
      .replace(/`([^`]+)`/g, "$1")
      // Autolinks <https://...>
      .replace(/<((?:https?|mailto):[^>\s]+)>/gi, "$1")
      // Collapse whitespace (incl. joined lines).
      .replace(/\s+/g, " ")
      .trim()
  );
}

function finish(paragraph: string, maxLength: number): string {
  const flat = flattenInlineMarkdown(paragraph);
  if (!flat) return "";
  return truncate(flat, maxLength);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  const hard = s.slice(0, max);
  const lastSpace = hard.lastIndexOf(" ");
  // Prefer cutting on a word boundary, but only if the boundary isn't
  // absurdly early (otherwise we'd throw away most of the excerpt).
  const cut = lastSpace > max * 0.6 ? hard.slice(0, lastSpace) : hard;
  // Drop dangling punctuation so the ellipsis reads cleanly.
  return cut.replace(/[\s.,;:!?—-]+$/u, "") + "…";
}
