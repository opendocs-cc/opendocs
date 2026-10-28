import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { FREE_PLAN_EXPORT_DEFAULTS } from "@opendocs/shared/workspaces/validation";

import { createOnboardedUser } from "../test-helpers/api";

// Flip the owner's personal plan to "pro" so the workspace's effective tier
// becomes paid. Mirrors the helper in document-limit.test.ts — kept local
// here so this test file can run standalone against the existing fixtures.
async function upgradeUserToPro(userId: string) {
  const [{ db }, { user }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  await db.update(user).set({ plan: "pro" }).where(eq(user.id, userId));
}

// Flip the workspace itself to "team" tier — lets us cover the Team path
// alongside Pro without needing a second user in the fixture.
async function upgradeWorkspaceToTeam(workspaceId: string) {
  const [{ db }, { workspaces }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  await db
    .update(workspaces)
    .set({ plan: "team" })
    .where(eq(workspaces.id, workspaceId));
}

async function readWorkspaceRow(workspaceId: string) {
  const [{ db }, { workspaces }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  const [row] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  return row;
}

describe("workspace Pro-gated endpoints", () => {
  it("seeds new workspaces with the Free-plan export branding defaults", async () => {
    const owner = await createOnboardedUser();
    const row = await readWorkspaceRow(owner.workspaceId);

    expect(row).toBeDefined();
    expect(row!.exportFontMain).toBe(FREE_PLAN_EXPORT_DEFAULTS.exportFontMain);
    expect(row!.brandColor).toBe(FREE_PLAN_EXPORT_DEFAULTS.brandColor);
    expect(row!.showLogoInExports).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.showLogoInExports,
    );
    expect(row!.exportFooterEnabled).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.exportFooterEnabled,
    );
    expect(row!.exportFooterCompanyName).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.exportFooterCompanyName,
    );
    expect(row!.exportFooterTagline).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.exportFooterTagline,
    );
    expect(row!.exportFooterLinkUrl).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.exportFooterLinkUrl,
    );
    expect(row!.exportFooterLinkLabel).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.exportFooterLinkLabel,
    );
  });

  it("lets a Free owner brand exports but keeps the OpenDocs footer", async () => {
    const owner = await createOnboardedUser();

    const font = await owner.agent
      .post("/api/v1/workspace/export-font")
      .send({ workspaceId: owner.workspaceId, font: "Inter" });
    const color = await owner.agent
      .post("/api/v1/workspace/brand-color")
      .send({ workspaceId: owner.workspaceId, color: "#123456" });
    const logo = await owner.agent
      .post("/api/v1/workspace/logo-in-exports")
      .send({ workspaceId: owner.workspaceId, show: true });
    for (const res of [font, color, logo]) {
      expect(res.status).toBe(200);
    }

    const footer = await owner.agent
      .post("/api/v1/workspace/export-footer")
      .send({
        workspaceId: owner.workspaceId,
        enabled: true,
        companyName: "Acme",
        tagline: "We ship",
        linkUrl: "https://acme.test",
        linkLabel: "acme.test",
      });
    expect(footer.status).toBe(403);
    expect(footer.body).toMatchObject({ error: "plan_required", tier: "free" });

    const row = await readWorkspaceRow(owner.workspaceId);
    expect(row!.exportFontMain).toBe("Inter");
    expect(row!.brandColor).toBe("#123456");
    expect(row!.showLogoInExports).toBe(true);
    // The 403 is a no-op at the DB level: the footer is still OpenDocs'.
    expect(row!.exportFooterCompanyName).toBe(
      FREE_PLAN_EXPORT_DEFAULTS.exportFooterCompanyName,
    );
    expect(row!.exportFooterTagline).toBe(FREE_PLAN_EXPORT_DEFAULTS.exportFooterTagline);
  });

  it("lets a Pro owner customise all 4 export branding settings", async () => {
    const owner = await createOnboardedUser();
    await upgradeUserToPro(owner.userId);

    const font = await owner.agent
      .post("/api/v1/workspace/export-font")
      .send({ workspaceId: owner.workspaceId, font: "Inter" });
    const footer = await owner.agent
      .post("/api/v1/workspace/export-footer")
      .send({
        workspaceId: owner.workspaceId,
        enabled: true,
        companyName: "Acme",
        tagline: "We ship",
        linkUrl: "https://acme.test",
        linkLabel: "acme.test",
      });
    const color = await owner.agent
      .post("/api/v1/workspace/brand-color")
      .send({ workspaceId: owner.workspaceId, color: "#123456" });
    const logo = await owner.agent
      .post("/api/v1/workspace/logo-in-exports")
      .send({ workspaceId: owner.workspaceId, show: true });

    expect(font.status).toBe(200);
    expect(footer.status).toBe(200);
    expect(color.status).toBe(200);
    expect(logo.status).toBe(200);

    const row = await readWorkspaceRow(owner.workspaceId);
    expect(row!.exportFontMain).toBe("Inter");
    expect(row!.brandColor).toBe("#123456");
    expect(row!.showLogoInExports).toBe(true);
    expect(row!.exportFooterCompanyName).toBe("Acme");
    expect(row!.exportFooterLinkUrl).toBe("https://acme.test");
  });

  it("lets a Team workspace customise all 4 export branding settings", async () => {
    const owner = await createOnboardedUser();
    await upgradeWorkspaceToTeam(owner.workspaceId);

    const font = await owner.agent
      .post("/api/v1/workspace/export-font")
      .send({ workspaceId: owner.workspaceId, font: "Inter" });
    const color = await owner.agent
      .post("/api/v1/workspace/brand-color")
      .send({ workspaceId: owner.workspaceId, color: "#00AA00" });
    const logo = await owner.agent
      .post("/api/v1/workspace/logo-in-exports")
      .send({ workspaceId: owner.workspaceId, show: true });

    expect(font.status).toBe(200);
    expect(color.status).toBe(200);
    expect(logo.status).toBe(200);

    const row = await readWorkspaceRow(owner.workspaceId);
    expect(row!.exportFontMain).toBe("Inter");
    expect(row!.brandColor).toBe("#00AA00");
    expect(row!.showLogoInExports).toBe(true);
  });
});
