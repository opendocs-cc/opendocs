import {
  EB_Garamond,
  IBM_Plex_Sans,
  Inter,
  JetBrains_Mono,
  Lato,
  Manrope,
  Merriweather,
  Roboto,
  Vollkorn,
} from "next/font/google";

// Web copies of the export fonts, so the font picker and branding presets
// in workspace settings preview the real typeface instead of whatever the
// visitor has installed. Only the settings page imports this module, and
// `preload: false` keeps the files off every other route.
const ibmPlexSans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "600"], preload: false });
const inter = Inter({ subsets: ["latin"], preload: false });
const lato = Lato({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const merriweather = Merriweather({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const vollkorn = Vollkorn({ subsets: ["latin"], weight: ["400", "600"], preload: false });
const roboto = Roboto({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const manrope = Manrope({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const ebGaramond = EB_Garamond({ subsets: ["latin"], weight: ["400", "700"], preload: false });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "700"], preload: false });

const LOADED_FAMILIES: Record<string, string> = {
  "IBM Plex Sans": ibmPlexSans.style.fontFamily,
  Inter: inter.style.fontFamily,
  Lato: lato.style.fontFamily,
  Merriweather: merriweather.style.fontFamily,
  Vollkorn: vollkorn.style.fontFamily,
  Roboto: roboto.style.fontFamily,
  Manrope: manrope.style.fontFamily,
  "EB Garamond": ebGaramond.style.fontFamily,
  "JetBrains Mono": jetbrainsMono.style.fontFamily,
};

/** CSS font-family for previewing an export font id, falling back to its stack. */
export function previewFontFamily(fontId: string, fallbackStack: string) {
  const loaded = LOADED_FAMILIES[fontId];
  return loaded ? `${loaded}, ${fallbackStack}` : fallbackStack;
}
