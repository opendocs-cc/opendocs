import { instanceWebUrl } from "./instance";

export const siteConfig = {
  name: "OpenDocs",
  description:
    "A private-by-default publishing layer for Markdown-native teams.",
  /** This instance's web origin: https://opendocs.cc, or a self-hosted one. */
  get url(): string {
    return instanceWebUrl();
  },
};
