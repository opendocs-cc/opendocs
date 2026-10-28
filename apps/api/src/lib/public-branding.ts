/**
 * Branding stamped on every PDF / DOCX that leaves the public endpoints (the
 * free tool pages and anonymous documents). Hardcoded to OpenDocs, with no
 * per-workspace overrides, so:
 *   1. Every file carries our footer: that's the whole growth-hack premise.
 *   2. The converter doesn't need to know whether the request is auth'd or
 *      not; it just receives a fully-resolved branding block.
 *
 * The footer link is tagged with what made the file (`utm_content`: a tool
 * slug, `anonymous` or `extension`), while the printed label stays
 * "opendocs.cc". Files from the browser extension point their readers to the
 * extension's page instead, since they're likely AI chat users too.
 *
 * Mirrors the `FREE_PLAN_EXPORT_DEFAULTS` in
 * `packages/shared/src/workspaces/validation.ts` — keep these in sync if
 * those defaults ever change.
 */
export function publicBranding(utmContent: string) {
  const extension = utmContent === "extension";
  return {
    accent_color: "#2E1C5C",
    branding: {
      company_name: "OpenDocs",
      footer_subtitle: extension ? "Made with OpenDocs for Chrome" : "Made with OpenDocs",
      company_url: `https://opendocs.cc/${extension ? "extension" : ""}?utm_source=tool&utm_medium=export&utm_content=${encodeURIComponent(utmContent)}`,
      company_url_label: extension ? "opendocs.cc/extension" : "opendocs.cc",
      show_logo: false,
      main_font: "Arial",
    },
  };
}
