// Presets and color rules are shared with the API and CLI so every
// surface offers the same choices. See packages/shared/src/workspaces/branding-presets.ts.
export {
  BRANDING_PRESETS,
  MIN_BRAND_CONTRAST,
  RECOMMENDED_BRAND_CONTRAST,
  assessBrandColor,
  findMatchingPreset,
  mixWithWhite,
  type BrandingPreset,
} from "@opendocs/shared/workspaces/branding-presets";
