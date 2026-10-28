import { describe, expect, it } from "vitest";

import { signingEmailBody } from "@opendocs/shared/integrations/docuseal";

// DocuSeal only puts the signing link where a custom body has
// {{submitter.link}}; without it signers got an email they couldn't sign from.
describe("signingEmailBody", () => {
  it("adds the signing link to a custom message", () => {
    const body = signingEmailBody("Hello Patrick, please sign this sample agreement.");
    expect(body.startsWith("Hello Patrick, please sign this sample agreement.")).toBe(true);
    expect(body).toContain("{{submitter.link}}");
  });

  it("keeps a message that already has the link", () => {
    const text = "Sign here: {{ submitter.link }}";
    expect(signingEmailBody(text)).toBe(text);
  });

  it("writes a default body when only a subject was given", () => {
    expect(signingEmailBody(undefined)).toContain("{{submitter.link}}");
    expect(signingEmailBody("   ")).toContain("{{template.name}}");
  });
});
