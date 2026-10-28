"""Render the landing-page demo documents with the real converter code.

Runs inside the doc-converter image (LibreOffice + export fonts) with the
current converter source mounted at /app and this folder at /work. Logos are
local files, so _resolve_logo is pointed at /work instead of fetching URLs.
The branding mirrors what the API sends for a workspace export:
accent_color + font_main, logo_url, company_name, footer_subtitle,
company_url and company_url_label.
"""
import sys

sys.path.insert(0, "/app")

from app import converter  # noqa: E402
from app.pdf_renderer import convert_md_to_pdf  # noqa: E402
from app.themes import brand_from_accent  # noqa: E402

DEMOS = [
    ("investor-update", "#13294B", "IBM Plex Sans", "halvard", "Halvard Capital", "Private and confidential", "halvard.example", "halvard.example"),
    ("annual-letter", "#6E1F2A", "Vollkorn", "ledger-lane", "Ledger & Lane", "Independent long-form journalism", "ledgerandlane.example", "ledgerandlane.example"),
    ("field-study", "#1F4D3A", "Merriweather", "mossbank", "Mossbank Institute", "Peatland and soil research", "mossbank.example", "mossbank.example"),
    ("product-spec", "#1F2328", "Inter", "arcwell", "Arcwell", "Field service software", "arcwell.example", "arcwell.example"),
    ("staff-handbook", "#0F4C5C", "Lato", "tidewater", "Tidewater Clinic", "Internal: staff only", "tidewater.example", "tidewater.example"),
    ("proposal", "#7C2D12", "EB Garamond", "calloway-reid", "Calloway & Reid Architects", "Conservation and new work", "callowayreid.example", "callowayreid.example"),
    ("incident-review", "#1E40AF", "JetBrains Mono", "northbeam", "Northbeam Payments", "Internal: engineering", "northbeam.example", "northbeam.example"),
    ("launch-brief", "#86198F", "Manrope", "kestrel", "Kestrel", "Confidential until launch", "kestrel.example", "kestrel.example"),
]
# Render a subset: python render.py proposal incident-review
if len(sys.argv) > 1:
    DEMOS = [demo for demo in DEMOS if demo[0] in sys.argv[1:]]

original_resolve_logo = converter._resolve_logo


def resolve_local_logo(brand):
    if brand.logo_url and brand.logo_url.startswith("/work/"):
        return brand.logo_url, False
    return original_resolve_logo(brand)


converter._resolve_logo = resolve_local_logo

for slug, accent, font, logo, company, tagline, url, label in DEMOS:
    brand = brand_from_accent(
        accent,
        font_main=font,
        logo_url=f"/work/logos/{logo}.png",
        company_name=company,
        footer_subtitle=tagline,
        company_url=f"https://{url}",
        company_url_label=label,
    )
    with open(f"/work/md/{slug}.md", encoding="utf-8") as fh:
        markdown = fh.read()
    pdf = convert_md_to_pdf(markdown, brand=brand)
    with open(f"/work/out/{slug}.pdf", "wb") as fh:
        fh.write(pdf)
    print(f"{slug}: {len(pdf)} bytes")
