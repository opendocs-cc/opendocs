---
title: Markdown that renders
description: What OpenDocs renders on the page and in PDF and Word exports, from tables, alerts, math and code to images, footnotes and signature blocks, and how titles, summaries and tags are taken from the file.
---

# Markdown that renders

OpenDocs reads GitHub-flavored Markdown plus a few additions, and the page, the PDF
and the Word file all follow the same rules, so a document looks the same wherever
it's read. Your agent knows this syntax; you can ask for the result.

> **Ask your agent**
>
> "Add a warning callout above the pricing table saying the numbers are estimates."
>
> "Add signature lines for Dana and the Northwind contact at the end of the agreement."

## What renders

| Feature | How to write it |
| --- | --- |
| Headings, bold, italic, links, lists, blockquotes, horizontal rules | Standard Markdown |
| Strikethrough | `~~old price~~` |
| Tables, with column alignment | GitHub tables (`\|---:\|` aligns right) |
| Task lists | `- [ ] Draft` and `- [x] Review` |
| Footnotes | `Revenue grew 18%.[^1]` and `[^1]: Unaudited.` |
| Code with syntax highlighting | Fenced blocks with a language: ` ```python ` |
| Alerts | `> [!NOTE]`, `> [!TIP]`, `> [!IMPORTANT]`, `> [!WARNING]`, `> [!CAUTION]` on the first line of a blockquote |
| Math (KaTeX) | `$E = mc^2$` inline, `$$...$$` as a block, or a paragraph of `formula(...)` |
| Highlight, subscript, superscript | `==key figure==`, `H~2~O`, `x^2^` |
| Definition lists | A term on one line, `: Its definition` on the next |
| Abbreviations | `*[ARR]: Annual recurring revenue` anywhere; on the page, hovering `ARR` shows it |
| Emoji shortcodes | `:white_check_mark:` |
| Smart punctuation | Straight quotes become curly; `--` is an en dash, `---` an em dash |
| Images and figures | `![Revenue by quarter](./revenue.png "Revenue by quarter")`. An image alone in a paragraph becomes a figure, captioned by its title or by an italic line right below it. |
| A metadata line | `Author: Dana \| Status: Draft` near the title is styled as quiet metadata |
| Page breaks | `\pagebreak` or `<!-- pagebreak -->` on its own line. In exports, a new page starts there. |
| Signature blocks | A ` ```signature ` fence. See [Signature blocks](#signature-blocks). |
| Private notes | A ` ```private ` fence. See [Private blocks](#private-blocks). |

A `$` followed by a digit stays a dollar sign, so "$5 and $10" isn't read as math.

### What doesn't render

- **Mermaid and other diagram code** shows as a code block, not a diagram. Export
  the diagram as an SVG or PNG and include it as an image; SVGs stay sharp in PDFs.
- **Scripts, styles, iframes and event handlers** in raw HTML are removed. Raw HTML
  can use formatting tags such as `<sub>`, `<sup>`, `<kbd>`, `<mark>`, `<details>`
  and `<img>`.
- **Front matter** isn't shown. Only its `title` is used.

### On the page

- The title from the file is shown above the document, so its leading `# Title`
  isn't repeated in the body.
- Every heading gets an anchor link (`¶`), and the headings form the table of
  contents.
- Code blocks use a light GitHub color theme.

### In PDF and Word exports

Exports render the same syntax. A few differences:

- Images can be PNG, JPEG, GIF, WebP or SVG. SVGs are drawn sharp for print. Each
  image keeps its own size, scaled down only when it's wider than the page.
- Math becomes native equations in Word.
- Raw HTML is reduced to its text and inline formatting; `<img>` tags are kept.
- The export theme sets the heading, link and table colors and the font. See
  [PDF, Word and branding](./branded-exports.md).

### Improvements reach old documents

When the renderer learns new syntax, documents published earlier are re-rendered
from their stored Markdown the next time they're opened. That doesn't create a
version or change the document's updated date.

## Signature blocks

A `signature` fence lists who signs. On the page and in PDF and Word exports, each
entry is drawn as a signing box: a line to sign on, the name, title and role, and a
date line.

````md
```signature
- role: Halvard
  name: Dana
  title: Chief Operating Officer
- role: Client
  name: Ines Moreau
  title: Head of Operations, Northwind
```
````

`role` is required and must be unique in the block; `name` and `title` are
optional. A block that breaks the rules renders as an ordinary code block. When the
document is sent for signing through DocuSeal, each box gets that signer's
signature and date fields. The full rules are in
[Mark where people sign](../integrations/docuseal.md#mark-where-people-sign).

## Private blocks

A `private` fence is left out of the page, PDF and Word exports, files saved to
Google Drive, the Markdown download on the page, the workspace's Markdown ZIP and
workspace search, so you can keep working notes in the source file:

````md
```private
Numbers still need sign-off from finance.
```
````

The fence can be three or more backticks or tildes (`~~~private` works too), and
it ends at a closing fence of the same kind. A private fence that's never closed
hides everything after it. A `private` fence shown inside another code block, as
an example, is left alone.

:::note Who still sees it
The block stays in the stored Markdown. You and members of the document's
workspace, who can edit it, get it back with `opendocs pull` and the API's raw
Markdown routes. Guests it's shared with and public readers never see it. Keep
anything your teammates shouldn't read out of the document.
:::

## Titles, summaries and tags

- **Title:** the front matter `title`, else the first `# Heading`, else "Untitled
  document". `--title` on publish overrides both. Up to 255 characters.
- **Slug:** made from the title unless `--slug` is given. See
  [Publish a document](./publish.md#titles-and-slugs).
- **Summary:** the first paragraph of prose, skipping headings, tables, code,
  blockquotes, images and HTML, up to 280 characters. It's used on the workspace
  page, in lists and in link previews.
- **Tags:** up to 20 per document, 64 characters each, stored lowercase without
  duplicates. The CLI takes them comma-separated (`--tags board,finance`); the API
  takes an array.

## Safe rendering

Rendered HTML is sanitized with GitHub's rules plus the elements OpenDocs's syntax
adds. Front matter is read as data and never run.

## Related pages

- [Publish a document](./publish.md)
- [PDF, Word and branding](./branded-exports.md)
- [E-signatures](../integrations/docuseal.md)
