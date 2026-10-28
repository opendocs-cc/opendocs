import matter from "gray-matter";
import rehypeKatex from "rehype-katex";
import rehypePrettyCode from "rehype-pretty-code";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options as SanitizeSchema } from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkEmoji from "remark-emoji";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import remarkSmartypants from "remark-smartypants";
import { unified } from "unified";
import { visit } from "unist-util-visit";

import { stripPrivateBlocks } from "./private-blocks";
import { extractAbbreviations, remarkOpenDocs } from "./syntax";

type Heading = {
  id: string;
  text: string;
  level: number;
};

type ContentNode = {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: ContentNode[];
};

const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

// GitHub's sanitization, plus the elements and classes OpenDocs' syntax
// produces (alerts, figures, highlights, math before KaTeX renders it).
// Raw HTML in a document goes through the same filter, so it can use the
// formatting tags but never scripts, styles or event handlers.
const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: "",
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "abbr",
    "cite",
    "figcaption",
    "figure",
    "mark",
    "small",
    "u",
  ],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "id"],
    a: [
      ...(defaultSchema.attributes?.a ?? []),
      "title",
      "ariaHidden",
      ["className", "headerlink"],
    ],
    abbr: ["title"],
    code: [["className", /^language-./, "math-inline", "math-display"]],
    div: [
      ...(defaultSchema.attributes?.div ?? []),
      [
        "className",
        "markdown-alert",
        /^markdown-alert-(note|tip|important|warning|caution)$/,
        "page-break",
        "od-signatures",
        "od-signature",
        "od-signature-line",
      ],
    ],
    figure: [["className", "od-figure", "od-figure-row"]],
    h1: [["className", "od-doc-title"]],
    img: [...(defaultSchema.attributes?.img ?? []), "title", "width", "height"],
    p: [
      [
        "className",
        "markdown-alert-title",
        "od-meta",
        "od-signature-name",
        "od-signature-title",
        "od-signature-role",
        "od-signature-date",
      ],
    ],
    span: [["className", "od-meta-sep", "od-signature-date-line"]],
  },
};

function extractTitle(markdown: string) {
  const lines = markdown.split("\n");

  for (const line of lines) {
    if (line.startsWith("# ")) {
      return line.replace(/^#\s+/, "").trim();
    }
  }

  return null;
}

function getNodeText(node: ContentNode): string {
  if (node.type === "text" && typeof node.value === "string") {
    return node.value;
  }

  if (!Array.isArray(node.children)) {
    return "";
  }

  return node.children.map((child) => getNodeText(child)).join("");
}

function addHeadingPermalinks() {
  return (tree: unknown, file: { data: Record<string, unknown> }) => {
    const headings: Heading[] = [];

    visit(tree as never, "element", (node: unknown) => {
      const typedNode = node as ContentNode;

      if (!typedNode.tagName || !headingTags.has(typedNode.tagName)) {
        return;
      }

      const id =
        typeof typedNode.properties?.id === "string" ? typedNode.properties.id : null;
      const text = getNodeText(typedNode).trim();

      if (!id || !text) {
        return;
      }

      headings.push({
        id,
        text,
        level: Number(typedNode.tagName.slice(1)),
      });

      typedNode.children = [
        ...(typedNode.children ?? []),
        {
          type: "element",
          tagName: "a",
          properties: {
            className: "headerlink",
            href: `#${id}`,
            title: "Permanent link",
            ariaHidden: "true",
          },
          children: [
            {
              type: "text",
              value: "¶",
            },
          ],
        },
      ];
    });

    file.data.headings = headings;
  };
}

const disabledFrontmatterEngine = () => ({});

/**
 * Stamped on every stored rendering (`sourceMetadata.rendererVersion`).
 * Bump it when renderMarkdown starts rendering existing Markdown
 * differently (new syntax, different markup): versions stamped with an
 * older number are re-rendered from their Markdown the next time they're
 * read. See posts/rendering.ts.
 *
 * 1: alerts, math, figures, marks, abbreviations, smart punctuation.
 * 2: private blocks fenced with tildes or longer fences are left out too.
 */
export const RENDERER_VERSION = 2;

export async function renderMarkdown(markdown: string) {
  const withoutPrivateBlocks = stripPrivateBlocks(markdown);
  // gray-matter `eval`s `---js` / `---javascript` front matter by default,
  // which would let any publisher run code on the server. Neutralise both.
  const { content, data } = matter(withoutPrivateBlocks, {
    engines: { js: disabledFrontmatterEngine, javascript: disabledFrontmatterEngine },
  });
  const { markdown: body, abbreviations } = extractAbbreviations(content);
  const file = await unified()
    .use(remarkParse)
    // `~~strike~~` only: a single tilde is subscript (`H~2~O`).
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkEmoji, { accessible: true })
    // -- is an en dash and --- an em dash, as in the exports.
    .use(remarkSmartypants, { dashes: "oldschool" })
    .use(remarkOpenDocs, { abbreviations })
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSlug)
    .use(addHeadingPermalinks)
    .use(rehypeSanitize, sanitizeSchema)
    // KaTeX runs after sanitizing: its output is trusted markup, and it
    // never enables \href or \htmlClass (trust is off). Invalid TeX is
    // shown as the source, marked as an error, instead of failing.
    .use(rehypeKatex, { strict: "ignore" })
    .use(rehypePrettyCode, { theme: "github-light", keepBackground: true })
    .use(rehypeStringify)
    .process(body);

  const titleFromFrontmatter =
    typeof data.title === "string" && data.title.trim().length > 0 ? data.title.trim() : null;
  const title = titleFromFrontmatter ?? extractTitle(content) ?? "Untitled document";

  return {
    title,
    html: String(file),
    toc: (file.data.headings as Heading[] | undefined) ?? [],
    frontmatter: data,
    content,
  };
}
