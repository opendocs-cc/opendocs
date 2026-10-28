/**
 * OpenDocs Markdown extensions on top of GitHub Flavored Markdown.
 *
 * The export converter (doc-converter/app/markdown_parser.py) speaks the
 * same dialect, so a document reads the same on the web, in PDF and DOCX:
 *
 * - `> [!NOTE]` … `> [!CAUTION]` alerts (GitHub syntax)
 * - `==highlight==`, `H~2~O`, `x^2^`
 * - definition lists (`Term` then `: Definition`)
 * - abbreviations (`*[HTML]: HyperText Markup Language`)
 * - `formula(...)` paragraphs (rendered as display math)
 * - page breaks (`\pagebreak`, `<!-- pagebreak -->`, the CSS `<div>` hack)
 * - a `Key: value | Key: value` metadata line near the title
 * - figures: an image alone in a paragraph, captioned by its title or by
 *   an italic paragraph right below it
 * - ```signature blocks: boxes to sign, one per signer (see
 *   signature-blocks.ts)
 */
import type {
  Blockquote,
  Code,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Text,
} from "mdast";
import { SKIP, visit } from "unist-util-visit";

import { parseSignatureBlock } from "./signature-blocks";

type Data = { hName?: string; hProperties?: Record<string, unknown> };
// mdast nodes rendered through `data.hName` / `data.hProperties`.
type Element = { type: string; data?: Data; children: unknown[] };

const ALERT_KINDS: Record<string, string> = {
  NOTE: "Note",
  TIP: "Tip",
  IMPORTANT: "Important",
  WARNING: "Warning",
  CAUTION: "Caution",
};

const ABBREVIATION = /^\*\[([^\]\n]+)\]:[ \t]*(.+?)[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const PAGE_BREAK_TEXT = new Set(["\\pagebreak", "\\newpage", "\\clearpage"]);
const PAGE_BREAK_HTML =
  /<!--\s*(?:page-?break|new-?page)\s*-->|<(?:div|hr|p|span)\b[^>]*style\s*=\s*['"][^'"]*(?:page-break-(?:before|after)\s*:\s*always|break-(?:before|after)\s*:\s*page)[^'"]*['"][^>]*>(?:\s*<\/(?:div|p|span)>)?/i;
const METADATA_LINE = (text: string) => {
  if (!text.includes("|") || text.startsWith("|")) return false;
  const parts = text.split("|").map((part) => part.trim());
  return parts.filter((part) => part.includes(":") && part.length < 100).length >= 2;
};

/**
 * Pull `*[HTML]: HyperText Markup Language` definitions out of the source
 * (outside code fences). Returns the Markdown without them, and the terms.
 */
export function extractAbbreviations(markdown: string) {
  const abbreviations = new Map<string, string>();
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split("\n")) {
    const fenceMatch = FENCE.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
    } else if (fence === null) {
      const abbr = ABBREVIATION.exec(line);
      if (abbr) {
        abbreviations.set(abbr[1].trim(), abbr[2]);
        continue;
      }
    }
    lines.push(line);
  }
  return { markdown: lines.join("\n"), abbreviations };
}

function element(hName: string, children: unknown[], hProperties?: Record<string, unknown>): Element {
  return { type: "odElement", data: { hName, hProperties }, children };
}

function textOf(node: { type: string; value?: string; children?: unknown[] }): string {
  if (typeof node.value === "string") return node.value;
  return (node.children ?? []).map((child) => textOf(child as never)).join("");
}

// ── Inline: ==mark==, ~sub~, ^sup^, abbreviations ─────────────────────────

const INLINE_PATTERNS: Array<[RegExp, string]> = [
  [/==(?=\S)([^=]*?\S)==/, "mark"],
  [/~(?=\S)([^\s~]+)~/, "sub"],
  [/\^(?=\S)([^\s^]+)\^/, "sup"],
];

function splitInline(value: string, abbreviations: RegExp | null, titles: Map<string, string>) {
  const out: PhrasingContent[] = [];
  let rest = value;
  while (rest) {
    let best: { index: number; length: number; node: PhrasingContent } | null = null;
    for (const [pattern, tag] of INLINE_PATTERNS) {
      const m = pattern.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = {
          index: m.index,
          length: m[0].length,
          node: element(tag, [{ type: "text", value: m[1] }]) as unknown as PhrasingContent,
        };
      }
    }
    if (abbreviations) {
      abbreviations.lastIndex = 0;
      const m = abbreviations.exec(rest);
      if (m && (best === null || m.index < best.index)) {
        best = {
          index: m.index,
          length: m[0].length,
          node: element("abbr", [{ type: "text", value: m[0] }], {
            title: titles.get(m[0]),
          }) as unknown as PhrasingContent,
        };
      }
    }
    if (!best) {
      out.push({ type: "text", value: rest });
      break;
    }
    if (best.index > 0) out.push({ type: "text", value: rest.slice(0, best.index) });
    out.push(best.node);
    rest = rest.slice(best.index + best.length);
  }
  return out;
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Block helpers ─────────────────────────────────────────────────────────

/** Split a paragraph's inline nodes into lines at text newlines. */
function paragraphLines(paragraph: Paragraph): PhrasingContent[][] {
  const lines: PhrasingContent[][] = [[]];
  for (const child of paragraph.children) {
    if (child.type !== "text" || !child.value.includes("\n")) {
      lines[lines.length - 1].push(child);
      continue;
    }
    child.value.split("\n").forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ type: "text", value: part });
    });
  }
  return lines;
}

function stripLeading(line: PhrasingContent[], prefix: RegExp): PhrasingContent[] | null {
  const first = line[0];
  if (!first || first.type !== "text") return null;
  const m = prefix.exec(first.value);
  if (!m) return null;
  const rest = first.value.slice(m[0].length);
  return rest ? [{ type: "text", value: rest }, ...line.slice(1)] : line.slice(1);
}

function alert(node: Blockquote): Element | null {
  const first = node.children[0];
  if (!first || first.type !== "paragraph") return null;
  const lead = first.children[0];
  if (!lead || lead.type !== "text") return null;
  const m = /^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)/i.exec(lead.value);
  if (!m) return null;
  const kind = m[1].toUpperCase();
  lead.value = lead.value.slice(m[0].length);
  if (!lead.value) first.children.shift();
  const body = first.children.length ? node.children : node.children.slice(1);
  return element(
    "div",
    [element("p", [{ type: "text", value: ALERT_KINDS[kind] }], { className: ["markdown-alert-title"] }), ...body],
    { className: ["markdown-alert", `markdown-alert-${kind.toLowerCase()}`] },
  );
}

function definitionList(paragraph: Paragraph): Element | null {
  const lines = paragraphLines(paragraph);
  if (lines.length < 2) return null;
  const items: Element[] = [];
  for (const line of lines) {
    const definition = stripLeading(line, /^:[ \t]+/);
    if (definition) {
      if (!items.length) return null;
      items.push(element("dd", definition));
    } else {
      if (items.length && items[items.length - 1].data?.hName === "dt") return null;
      items.push(element("dt", line));
    }
  }
  return items[items.length - 1].data?.hName === "dd" ? element("dl", items) : null;
}

/** A `$$` block, shaped the way remark-math builds them for rehype-katex. */
function displayMath(value: string): RootContent {
  return {
    type: "math",
    value,
    data: {
      hName: "pre",
      hChildren: [
        {
          type: "element",
          tagName: "code",
          properties: { className: ["language-math", "math-display"] },
          children: [{ type: "text", value }],
        },
      ],
    },
  } as RootContent;
}

function onlyImages(paragraph: Paragraph) {
  const images: PhrasingContent[] = [];
  for (const child of paragraph.children) {
    if (child.type === "image" || (child.type === "link" && child.children.every((c) => c.type === "image"))) {
      images.push(child);
    } else if (child.type !== "text" || child.value.trim()) {
      return null;
    }
  }
  return images.length ? images : null;
}

function isCaption(node: RootContent | undefined): node is Paragraph {
  return (
    node?.type === "paragraph" &&
    node.children.length === 1 &&
    node.children[0].type === "emphasis"
  );
}

// ── Signature blocks ───────────────────────────────────────────────────────

const textNode = (value: string) => ({ type: "text", value });

/**
 * A ```signature fence as signing boxes: a line to sign on, the name (or
 * the role), title and role, and a date line. Laid out like the export.
 * Anything that isn't a valid block stays a code block.
 */
function signatureBlock(node: Code): Element | null {
  if (node.lang?.toLowerCase() !== "signature" || node.meta) return null;
  const entries = parseSignatureBlock(node.value);
  if (!entries) return null;
  const boxes = entries.map((entry) =>
    element(
      "div",
      [
        element("div", [], { className: ["od-signature-line"] }),
        element("p", [textNode(entry.name ?? entry.role)], { className: ["od-signature-name"] }),
        ...(entry.title ? [element("p", [textNode(entry.title)], { className: ["od-signature-title"] })] : []),
        ...(entry.name ? [element("p", [textNode(entry.role)], { className: ["od-signature-role"] })] : []),
        element("p", [textNode("Date"), element("span", [], { className: ["od-signature-date-line"] })], {
          className: ["od-signature-date"],
        }),
      ],
      { className: ["od-signature"] },
    ),
  );
  return element("div", boxes, { className: ["od-signatures"] });
}

/** The remark plugin. */
export function remarkOpenDocs(options: { abbreviations?: Map<string, string> } = {}) {
  const titles = options.abbreviations ?? new Map<string, string>();
  const terms = [...titles.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const abbreviations = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.join("|")})(?![\\p{L}\\p{N}])`, "gu") : null;

  return (tree: Root, file: { value: unknown }) => {
    keepPricesAsText(tree, String(file.value));

    // Inline syntax inside text (code and math are separate nodes, so
    // they're never touched).
    visit(tree, "text", (node: Text, index, parent) => {
      if (!parent || index === undefined) return;
      const parts = splitInline(node.value, abbreviations, titles);
      if (parts.length === 1 && parts[0].type === "text") return;
      (parent.children as PhrasingContent[]).splice(index, 1, ...parts);
      return [SKIP, index + parts.length];
    });

    visit(tree, "code", (node: Code, index, parent) => {
      const block = signatureBlock(node);
      if (block && parent && index !== undefined) {
        (parent.children as unknown[])[index] = block;
        return SKIP;
      }
    });

    visit(tree, "blockquote", (node: Blockquote, index, parent) => {
      const replacement = alert(node);
      if (replacement && parent && index !== undefined) {
        (parent.children as unknown[])[index] = replacement;
      }
    });

    visit(tree, (node, index, parent) => {
      if (!parent || index === undefined) return;
      const siblings = parent.children as RootContent[];
      if (node.type === "html" && PAGE_BREAK_HTML.test((node as { value: string }).value)) {
        siblings[index] = element("div", [], { className: ["page-break"] }) as unknown as RootContent;
        return;
      }
      if (node.type !== "paragraph") return;
      const paragraph = node as Paragraph;
      const text = textOf(paragraph).trim();
      if (PAGE_BREAK_TEXT.has(text)) {
        siblings[index] = element("div", [], { className: ["page-break"] }) as unknown as RootContent;
        return;
      }
      const formula = /^formula\(([\s\S]+)\)$/.exec(text);
      if (formula && paragraph.children.every((child) => child.type === "text")) {
        siblings[index] = displayMath(formula[1]);
        return;
      }
      const images = onlyImages(paragraph);
      if (images) {
        const children: unknown[] = [...images];
        const firstImage = images[0].type === "image" ? images[0] : (images[0] as { children: PhrasingContent[] }).children[0];
        const title = images.length === 1 && firstImage.type === "image" ? firstImage.title : null;
        const next = siblings[index + 1];
        if (isCaption(next)) {
          children.push(element("figcaption", next.children[0].type === "emphasis" ? next.children[0].children : []));
          siblings.splice(index + 1, 1);
        } else if (title) {
          children.push(element("figcaption", [{ type: "text", value: title }]));
        }
        siblings[index] = element("figure", children, {
          className: images.length > 1 ? ["od-figure", "od-figure-row"] : ["od-figure"],
        }) as unknown as RootContent;
        return SKIP;
      }
      const deflist = definitionList(paragraph);
      if (deflist) {
        // Terms separated by blank lines still make one list.
        const previous = siblings[index - 1] as unknown as Element | undefined;
        if (previous?.data?.hName === "dl") {
          previous.children.push(...deflist.children);
          siblings.splice(index, 1);
          return [SKIP, index];
        }
        siblings[index] = deflist as unknown as RootContent;
        return SKIP;
      }
    });

    markTitleAndMetadata(tree);
  };
}

/**
 * `$...$` is math only by Pandoc's rule: no space just inside the dollars
 * and no digit right after the closing one. Otherwise "$5 and $10" would
 * typeset "5 and " as a formula. The export converter applies the same rule.
 */
function keepPricesAsText(tree: Root, source: string) {
  visit(tree, "inlineMath", (node, index, parent) => {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined || !parent || index === undefined) return;
    const raw = source.slice(start, end);
    if (raw.startsWith("$$")) return;
    const inner = raw.slice(1, -1);
    if (/^\s|\s$/.test(inner) || /\d/.test(source[end] ?? "")) {
      (parent.children as PhrasingContent[]).splice(index, 1, { type: "text", value: raw });
    }
  });
}

/**
 * The page shows the document title above the body, so the Markdown's
 * leading `# Title` is marked to be hidden there. A `Key: value | Key:
 * value` line (or `**Key:** value` lines) next to it is the document's
 * metadata and gets its own quiet style.
 */
function markTitleAndMetadata(tree: Root) {
  let seenTitle = false;
  for (const [position, node] of tree.children.entries()) {
    if (node.type === "heading") {
      if (node.depth === 1 && !seenTitle) {
        seenTitle = true;
        node.data = { ...node.data, hProperties: { ...(node.data?.hProperties ?? {}), className: ["od-doc-title"] } };
        continue;
      }
      return;
    }
    if (node.type === "html" && !node.value.replace(/<!--[\s\S]*?-->/g, "").trim()) continue;
    if (node.type !== "paragraph") return;
    const text = textOf(node).trim();
    const boldKey = node.children[0]?.type === "strong" && /^[^:\n]{1,40}:\s/.test(text);
    const isLine = METADATA_LINE(text);
    if (!isLine && !(boldKey && !seenTitle)) return;
    node.data = { ...node.data, hProperties: { className: ["od-meta"] } };
    if (isLine) {
      // "Author: Jane | Version: 2" → "Author: Jane · Version: 2"
      node.children = node.children.flatMap((child) => {
        if (child.type !== "text") return [child];
        return child.value.split(/\s*\|\s*/).flatMap((part, i) => [
          ...(i ? [element("span", [{ type: "text", value: "·" }], { className: ["od-meta-sep"] }) as unknown as PhrasingContent] : []),
          ...(part ? [{ type: "text", value: part } as PhrasingContent] : []),
        ]);
      });
    }
    if (seenTitle || position > 3) return;
  }
}
