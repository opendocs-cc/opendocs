---
title: PDF, Word and branding
description: Get a typeset PDF or Word file of any document, and set the brand color, font, logo and footer that every export in your workspace uses.
---

# PDF, Word and branding

Any document can come back as a PDF or a Word file, typeset from the same Markdown
by OpenDocs's converter rather than printed from a web page. Every export uses
your workspace's **export theme**: a brand color, a font and your logo on any
plan, and on Pro and Team your own footer in place of "Made with OpenDocs". Files
from you, your team and your agents look the same.

> **Ask your agent**
>
> "Send me the board report as a PDF."
>
> "Export everything in the Investors project as PDFs."
>
> "Use the Boardroom preset with our logo on every export."

## What you get

- **A file in your folder.** When your agent publishes and exports in one step, the
  PDF lands next to the Markdown (`board-report.md` gets `board-report.pdf`). A
  whole project goes into a folder of its own.
- **PDF on every plan, with your branding.** Every plan can use its own logo,
  brand color, font and presets. On Free, exports end with a "Made with OpenDocs"
  footer, even if the workspace kept its own footer from an earlier paid plan;
  that footer is saved and applies again when you upgrade.
- **Word (.docx) on Pro and Team.**
- **The same content as the page.** Tables, alerts, math, code, images, footnotes
  and signature blocks all come through. See
  [Markdown that renders](./rendering-and-metadata.md).
- **Optional landscape pages** for wide tables.

To file exports in Google Drive instead of your folder, ask your agent to save the
document to one of your workspace's Drive folders. See
[Google Drive](../integrations/google-drive.md).

### The export theme

The theme belongs to the workspace and applies to every PDF and Word export in it,
whoever makes it. Owners and admins can change it on any plan, in the dashboard
under **Settings → Export branding** or through their agent; only the footer needs
Pro or Team. Your agent proposes a preset (or a color and font) and waits for your
OK before changing it. **Download sample PDF** in the same section shows how your
exports look with the current settings.

## Presets

Each preset is a tested color and font pairing:

| Preset | Brand color | Font | Good for |
| --- | --- | --- | --- |
| `classic` | `#2E1C5C` purple | Arial | The OpenDocs house style |
| `boardroom` | `#13294B` navy | IBM Plex Sans | Board updates, investor memos, policies |
| `editorial` | `#6E1F2A` oxblood | Vollkorn | Essays and long reports |
| `research` | `#1F4D3A` forest green | Merriweather | Whitepapers, studies, technical reports |
| `studio` | `#1F2328` graphite | Inter | Product specs, design docs, release notes |
| `field-guide` | `#0F4C5C` deep teal | Lato | Handbooks, onboarding, how-to guides |
| `letterpress` | `#7C2D12` rust | EB Garamond | Proposals, letters, formal reports |
| `terminal` | `#1E40AF` cobalt | JetBrains Mono | Changelogs, runbooks, incident reviews |
| `launch` | `#86198F` fuchsia | Manrope | Launch briefs, one-pagers, announcements |

## Fonts

| Font | Style | Good for |
| --- | --- | --- |
| Arial | Neutral sans (default) | Anything |
| Inter | Modern sans | Specs, design docs |
| IBM Plex Sans | Corporate sans | Board updates, memos, policies |
| Lato | Warm humanist sans | Handbooks, how-to guides |
| Roboto | Familiar neutral sans | Reports and documents of any kind |
| Manrope | Modern grotesque | Launch briefs, one-pagers |
| Merriweather | Sturdy serif | Whitepapers, studies |
| Vollkorn | Editorial serif | Essays, long reports |
| EB Garamond | Classic Garamond serif | Proposals, letters, formal reports |
| JetBrains Mono | Monospace | Changelogs, runbooks, incident reviews |

Serifs suit long, reading-heavy documents; sans fonts suit specs, memos and
handbooks. With JetBrains Mono, code blocks use it too.

## The brand color must be dark

The converter uses the brand color for headings, links, the table-header background
(with white text on it) and the footer's first line. A light wash of it tints
alternating table rows and code blocks. Body text is always near-black (`#171717`)
and can't be changed.

- The color needs at least **4.5:1** contrast against white. Lighter colors are
  refused with [`low_contrast`](../errors.md#low-contrast).
- Aim for **7:1** or more for long documents. Every preset is above 8:1.
- Use the deepest usable shade of your brand's hue: a navy instead of a bright
  blue, a forest green instead of a lime. Pastel, neon, yellow and light grey don't
  work.

## Logo and footer

When it's turned on, the logo sits in the top-right corner of every page. It also
appears on your workspace page. Use a PNG, JPEG or WebP up to 2 MB; a square or
wide PNG with a transparent background works best.

The footer has up to three parts: a company name (the workspace name by default), a
tagline and a link. It can be turned off.

## Under the hood

### Export commands

```bash
opendocs publish board-report.md --export pdf --json    # publish, then write board-report.pdf
opendocs export board-report -f pdf                     # an existing document → ./board-report.pdf
opendocs export board-report -f docx -o exports/
opendocs export q3-update q2-update q1-update -f pdf -o ./investor-pdfs
opendocs export --project investors -f pdf              # → ./investors-pdf/
```

| `opendocs export` flag | Meaning |
| --- | --- |
| `-f, --format <format>` | `pdf` or `docx`. The default is `pdf`. |
| `-o, --output <path>` | A file for one document (an existing folder or a path ending in `/` gets `<slug>.<ext>` inside it); a folder for several. |
| `--project <slug>` | Every document in a project, in batches of 10. Default folder `./<project>-<format>`. |
| `--stdout` | Write the file to stdout. One document only. |
| `--landscape` | Landscape pages. |
| `--accent-color <hex>` | Brand color for this export only. |

- One command takes up to 10 documents; more fail with `too_many_posts` before any
  request. `--project` has no such limit.
- Batch exports, which `opendocs export` uses for several documents or
  `--project` and `publish --export` uses for files it updated, include any
  document you can read, teammates' included. One you can't read comes back as
  `not_found` in the results.
- Each export is cached by its content and theme, so exporting an unchanged
  document again is fast.
- `docx` on Free fails with `docx_requires_pro`.
- Rate limits: 120 exports and 30 batch exports a minute, at most 4 running at once
  per account. The CLI waits and retries on `429`.

`publish --export` details, including re-exporting a folder after edits, are in
[Publish a document](./publish.md#publish-and-export-together). The endpoints are in
the [Exports API](../api-reference/exports.md).

### Theme commands

Reading the theme works for any member:

```bash
opendocs theme --json                 # current color, font, preset, logo, footer, canEdit
opendocs theme presets --json
opendocs theme fonts --json
opendocs theme check "#0B3D5C"        # contrast against white; changes nothing
```

Changing it is for owners and admins, on any plan; `theme footer` needs Pro or
Team. Outside a terminal, `set`, `footer` and `logo` refuse with `confirm_required` unless you pass `--yes`, so your
agent asks you first:

```bash
opendocs theme set --preset boardroom --yes --json
opendocs theme set --color "#0B3D5C" --font "IBM Plex Sans" --yes --json
opendocs theme logo ./halvard-logo.png --yes
opendocs theme set --logo-in-exports on --yes
opendocs theme footer --company "Halvard" --tagline "Investor relations" \
  --link-url halvard.example --link-label halvard.example --yes
opendocs theme footer --off --yes
opendocs theme logo --remove --yes
```

| `theme set` flag | Meaning |
| --- | --- |
| `--preset <id>` | Apply a preset's color and font. |
| `--color <hex>` | Brand color, at least 4.5:1 on white. |
| `--font <name>` | One of the 10 fonts. |
| `--logo-in-exports on\|off` | Show the workspace logo in exports. |
| `--allow-low-contrast` | Save a color below 4.5:1 anyway. Not recommended. |

`theme footer` takes `--company`, `--tagline`, `--link-url`, `--link-label`, `--on`
and `--off`. After a change, export one document as a preview:

```bash
opendocs export board-report -f pdf
```

Errors: `forbidden` (members can't change the theme), `plan_required` (a footer
change on Free),
`low_contrast`, `invalid_preset`, `invalid_font`. The API behind these commands is
[`GET` and `PATCH /api/v1/workspace/branding`](../api-reference/agent-endpoints.md#export-theme).

## Related pages

- [Publish a document](./publish.md)
- [Markdown that renders](./rendering-and-metadata.md)
- [Google Drive](../integrations/google-drive.md)
- [Plans and limits](../getting-started/plans-and-limits.md)
