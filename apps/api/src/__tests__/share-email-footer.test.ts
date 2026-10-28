import { describe, expect, it } from "vitest";

import { documentSharedEmail, signInCodeEmail, teamInvitationEmail } from "@opendocs/shared/email";

describe("emails people get because someone used OpenDocs", () => {
  it("say what OpenDocs is, with a tracked link", () => {
    const share = documentSharedEmail({ docUrl: "https://opendocs.cc/acme/plan", docTitle: "Plan", sharedByName: "Dana" });
    expect(share).toContain("Sent with");
    expect(share).toContain("https://opendocs.cc/?utm_source=email&utm_medium=product&utm_content=share");

    const invite = teamInvitationEmail({ inviteUrl: "https://opendocs.cc/invite/t", workspaceName: "Acme", invitedByName: "Dana" });
    expect(invite).toContain("utm_content=invite");
    expect(invite).toContain("where AI agents publish Markdown");
  });

  it("leave the sign-in code email plain", () => {
    expect(signInCodeEmail("123456")).not.toContain("utm_source");
  });
});
