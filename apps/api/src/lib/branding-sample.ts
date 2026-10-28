/**
 * The document behind "Download sample PDF" in Workspace settings → Export
 * branding: one page-and-a-bit that uses most of what a branded export
 * shows (title, metadata, headings, lists, a table, a callout, a quote,
 * code), written to say why branding is worth the two minutes.
 */
export function brandingSampleMarkdown(workspaceName: string, date: Date = new Date()): string {
  const day = date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `# Why well-branded documents matter

Prepared by: ${workspaceName} | Date: ${day} | Status: Sample export

This is a sample of how ${workspaceName}'s documents look as a PDF with your current export branding: brand color, font, logo and footer. Change any of them in Workspace settings, download this sample again, and compare.

## First impressions are visual

People decide whether a document looks trustworthy before they read a word. A consistent color, a readable typeface and your logo in the corner tell a client or a colleague that someone cared about the details. The same content in a plain, unbranded file reads like a draft.

> [!TIP]
> Pick a dark brand color. It's used for headings and as the background behind white table-header text, so it has to stay readable.

## What branding changes

- **Headings and accents** use your brand color, so every report, proposal and memo looks like it came from the same place.
- **The font** sets the tone: a serif like Merriweather reads like a considered report, a sans-serif like Inter like a modern product doc.
- **Your logo** in the top corner makes every page recognisably yours, even when it's forwarded or printed.

## A table, for example

| Document | Without branding | With branding |
|---|---|---|
| Client proposal | Looks like a draft | Looks like your company |
| Board report | Generic | Consistent with every report before it |
| Onboarding guide | Easy to skim past | Feels official |

## Consistency builds trust

1. Every document an agent publishes picks up the same branding automatically.
2. Nobody has to remember a template or fix fonts by hand.
3. Readers learn what your documents look like, and trust them faster.

> Your documents are part of your brand. They should look like it.

## Code looks good too

\`\`\`bash
opendocs publish report.md --export pdf
\`\`\`

That command publishes a document and saves a PDF exactly like this one next to it.
`;
}
