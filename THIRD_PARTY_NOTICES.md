# Third-party notices

OpenDocs uses open-source packages from npm, listed with their licenses in
`package-lock.json`. Almost all are under permissive licenses (MIT, ISC,
BSD, Apache-2.0). The notable exceptions are used unmodified:

| Component | License | How it's used |
| --- | --- | --- |
| `@img/sharp-*` (prebuilt `sharp` and libvips binaries, pulled in by Next.js via `sharp`) | LGPL-3.0-or-later for the libvips packages; the Windows and WebAssembly builds bundle it, so they're Apache-2.0 AND LGPL-3.0-or-later | Optional dependency, used unmodified |
| `jszip` | MIT or GPL-3.0-or-later | Used under MIT |
| `lightningcss` | MPL-2.0 | Build tool, used unmodified |

Files copied into this repository:

| Path | Source | License |
| --- | --- | --- |
| `apps/web/public/mkdocs/assets/stylesheets/main.484c7ddc.min.css`, `palette.ab4e12ef.min.css` | [Material for MkDocs](https://github.com/squidfunk/mkdocs-material) | MIT, Copyright (c) 2016-2025 Martin Donath (below) |
| `apps/web/public/github.svg`, the logos in `apps/web/lib/agent-logos.ts` | [Simple Icons](https://simpleicons.org) | CC0-1.0. The logos are trademarks of their owners and are used to say which tools OpenDocs works with |
| `apps/web/public/x.svg` | The X logo | A trademark of X Corp., used to link to OpenDocs on X |

Fonts are loaded from Google Fonts or the `@fontsource` packages (SIL Open
Font License) and aren't committed here as font files. The example PDFs in
`apps/web/public/examples/` embed subsets of the fonts they're set in (EB
Garamond, IBM Plex Sans, Inter, JetBrains Mono, Lato, Manrope, Merriweather
and Vollkorn, all under the SIL Open Font License) and of LibreOffice's
OpenSymbol, as the converter produced them. The document converter
([opendocs-cc/doc-converter](https://github.com/opendocs-cc/doc-converter))
has its own notices.

## Material for MkDocs

```
Copyright (c) 2016-2025 Martin Donath <martin.donath@squidfunk.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to
deal in the Software without restriction, including without limitation the
rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```
