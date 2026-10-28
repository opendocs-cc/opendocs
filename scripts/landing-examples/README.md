# Landing page example documents

Sources for the sample exports on the home page (`apps/web/public/examples`).
The organizations are fictional. Each document is exported with one of the
branding presets and a sample logo, using the real converter code, so the
pages are exactly what a workspace with that theme would get.

| Document | Preset | Logo |
| --- | --- | --- |
| `md/investor-update.md` | Boardroom (`#13294B`, IBM Plex Sans) | `logos/halvard.png` |
| `md/annual-letter.md` | Editorial (`#6E1F2A`, Vollkorn) | `logos/ledger-lane.png` |
| `md/field-study.md` | Research (`#1F4D3A`, Merriweather) | `logos/mossbank.png` |
| `md/product-spec.md` | Studio (`#1F2328`, Inter) | `logos/arcwell.png` |
| `md/staff-handbook.md` | Field guide (`#0F4C5C`, Lato) | `logos/tidewater.png` |
| `md/proposal.md` | Letterpress (`#7C2D12`, EB Garamond) | `logos/calloway-reid.png` |
| `md/incident-review.md` | Terminal (`#1E40AF`, JetBrains Mono) | `logos/northbeam.png` |
| `md/launch-brief.md` | Launch (`#86198F`, Manrope) | `logos/kestrel.png` |

## Regenerate

From a checkout with the `doc-converter` repo next to this one:

```bash
# 1. Build the converter image (LibreOffice + export fonts)
docker build -t doc-converter-demo ../doc-converter

# 2. Render the PDFs with the current converter code
mkdir -p scripts/landing-examples/out
docker run --rm --entrypoint python \
  -v "$PWD/../doc-converter":/app -v "$PWD/scripts/landing-examples":/work -w /app \
  doc-converter-demo /work/render.py            # or: render.py proposal launch-brief

# 3. First-page previews (1000 px wide WebP) and PDFs for the site
for f in scripts/landing-examples/out/*.pdf; do
  n=$(basename "$f" .pdf)
  pdftoppm -png -r 150 -f 1 -l 1 -singlefile -scale-to-x 1000 -scale-to-y -1 "$f" "/tmp/$n"
  cwebp -quiet -q 82 "/tmp/$n.png" -o "apps/web/public/examples/$n.webp"
  cp "$f" "apps/web/public/examples/$n.pdf"
done
```

`logos.py` redraws the sample logos with Pillow (it uses macOS system fonts).
If you change the Markdown, update the excerpts in
`apps/web/lib/landing-examples.ts` too.
