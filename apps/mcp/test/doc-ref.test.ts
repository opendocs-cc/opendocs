import { describe, expect, it } from "vitest";

import { parseDocRef } from "../src/lib/doc-ref";

const HOSTS = ["opendocs.cc", "www.opendocs.cc"];

describe("parseDocRef", () => {
  it("passes IDs through", () => {
    expect(parseDocRef("0B6E1C1A-1234-4ABC-9DEF-0123456789AB", HOSTS)).toEqual({
      ref: "0b6e1c1a-1234-4abc-9def-0123456789ab",
    });
  });

  it("reads default-project links", () => {
    expect(parseDocRef("https://opendocs.cc/acme/board-memo", HOSTS)).toEqual({
      ref: "board-memo",
      workspaceSlug: "acme",
    });
  });

  it("reads project links, with or without a scheme", () => {
    expect(parseDocRef("opendocs.cc/acme/projects/legal/nda?x=1#top", HOSTS)).toEqual({
      ref: "nda",
      workspaceSlug: "acme",
      projectSlug: "legal",
    });
  });

  it("reads custom-domain links", () => {
    expect(parseDocRef("https://docs.acme.com/projects/legal/nda", HOSTS)).toEqual({
      ref: "nda",
      projectSlug: "legal",
    });
    expect(parseDocRef("https://docs.acme.com/handbook", HOSTS)).toEqual({ ref: "handbook" });
  });

  it("reads slugs and workspace/slug", () => {
    expect(parseDocRef("board-memo", HOSTS)).toEqual({ ref: "board-memo" });
    expect(parseDocRef("acme/board-memo", HOSTS)).toEqual({ ref: "board-memo", workspaceSlug: "acme" });
  });
});
