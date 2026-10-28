import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

let emailSequence = 0;
function uniqueEmail(prefix: string) {
  emailSequence += 1;
  return `${prefix}@t${Date.now()}${emailSequence}.agents.example.com`;
}

async function latestCodeFor(email: string) {
  const { devOutbox } = await import("@opendocs/shared/email");
  const message = [...devOutbox].reverse().find((item) => item.to === email.toLowerCase());
  const code = message?.subject.match(/^(\d{6}) is your OpenDocs sign-in code$/)?.[1];
  if (!code) throw new Error(`No sign-in code was sent to ${email}`);
  return code;
}

async function signUpWithCode(email: string, keyName?: string) {
  const app = await getTestApp();
  const requested = await request(app).post("/api/v1/auth/code/request").send({ email });
  expect(requested.status).toBe(200);
  const code = await latestCodeFor(email);
  const verified = await request(app)
    .post("/api/v1/auth/code/verify")
    .set("X-OpenDocs-Client", "claude-code")
    .send({ email, code, ...(keyName ? { keyName } : {}) });
  expect(verified.status).toBe(200);
  return verified.body as {
    apiKey: string;
    keyName: string;
    accountCreated: boolean;
    userId: string;
    username: string;
    workspace: { id: string; slug: string; name: string };
    defaultProject: { id: string; slug: string } | null;
  };
}

async function db() {
  const [{ db }, schema] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  return { db, schema };
}

afterEach(() => {
  delete process.env.SIGNUPS_DISABLED;
});

describe("email sign-in codes (agent signup)", () => {
  it("creates a ready-to-publish account and a named API key from one code", async () => {
    const app = await getTestApp();
    const email = uniqueEmail("Jane.Doe");

    const result = await signUpWithCode(email);

    expect(result.apiKey).toMatch(/^od_live_/);
    expect(result.keyName).toBe("claude-code");
    expect(result.accountCreated).toBe(true);
    expect(result.username).toBe("jane-doe");
    expect(result.workspace.slug).toBe(result.username);
    expect(result.defaultProject?.slug).toBe("default");

    const me = await request(app).get("/api/v1/me").set(authHeaders(result.apiKey));
    expect(me.status).toBe(200);
    expect(me.body.onboarding.workspace.id).toBe(result.workspace.id);

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(result.apiKey))
      .send({ markdown: "# First doc\n\nHello.", workspaceId: result.workspace.id });
    expect(published.status).toBe(201);

    const { db: database, schema } = await db();
    const [account] = await database
      .select({ emailVerified: schema.user.emailVerified, name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, result.userId));
    expect(account.emailVerified).toBe(true);
    expect(account.name).toBe("Jane Doe");
  });

  it("signs an existing account back in without creating another workspace", async () => {
    const email = uniqueEmail("returning");
    const first = await signUpWithCode(email);
    const second = await signUpWithCode(email, "cursor");

    expect(second.accountCreated).toBe(false);
    expect(second.userId).toBe(first.userId);
    expect(second.workspace.id).toBe(first.workspace.id);
    expect(second.keyName).toBe("cursor");
    expect(second.apiKey).not.toBe(first.apiKey);
  });

  it("rejects a wrong code with an actionable error", async () => {
    const app = await getTestApp();
    const email = uniqueEmail("wrong");
    await request(app).post("/api/v1/auth/code/request").send({ email });
    const code = await latestCodeFor(email);
    const wrong = code === "000000" ? "111111" : "000000";

    const res = await request(app).post("/api/v1/auth/code/verify").send({ email, code: wrong });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "invalid_code" });
    expect(res.body.message).toMatch(/not valid/);
    expect(res.body.docs_url).toBe("https://docs.opendocs.cc/errors#invalid-code");
  });

  it("refuses new accounts while signups are disabled", async () => {
    const app = await getTestApp();
    process.env.SIGNUPS_DISABLED = "true";

    const res = await request(app)
      .post("/api/v1/auth/code/request")
      .send({ email: uniqueEmail("closed") });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("signups_disabled");
  });
});

describe("anonymous documents", () => {
  it("publishes without an account, updates with the claim token, and claims into a workspace", async () => {
    const app = await getTestApp();

    const created = await request(app)
      .post("/api/v1/anonymous/publish")
      .set("X-OpenDocs-Client", "codex")
      .send({ markdown: "# Draft plan\n\nShip it." });
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(created.body.url).toMatch(/\/a\/[A-Za-z0-9_-]{22}$/);
    expect(created.body.claimUrl).toContain(`/claim/${created.body.claimToken}`);
    expect(new Date(created.body.expiresAt).getTime() - Date.now()).toBeGreaterThan(23 * 3600_000);

    const wrongToken = await request(app)
      .put(`/api/v1/anonymous/${created.body.id}`)
      .send({ markdown: "# Hijacked", claimToken: "odc_wrong" });
    expect(wrongToken.status).toBe(403);
    expect(wrongToken.body.error).toBe("invalid_claim_token");

    const updated = await request(app)
      .put(`/api/v1/anonymous/${created.body.id}`)
      .send({ markdown: "# Draft plan v2\n\nShip it now.", claimToken: created.body.claimToken });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("Draft plan v2");

    const { getAnonymousDoc } = await import("@opendocs/shared/anonymous/service");
    expect((await getAnonymousDoc(created.body.id))?.title).toBe("Draft plan v2");

    const owner = await createOnboardedUser({ workspaceName: "Claimers" });
    const claimed = await request(app)
      .post("/api/v1/anonymous/claim")
      .set(authHeaders(owner.apiKey))
      .send({ claimToken: created.body.claimToken, workspaceId: owner.workspaceId });
    expect(claimed.status).toBe(201);
    expect(claimed.body).toMatchObject({ title: "Draft plan v2", claimedFrom: created.body.id });
    expect(claimed.body.url).toBe(`/${owner.workspaceSlug}/draft-plan-v2`);

    const post = await request(app)
      .get(`/api/v1/posts/${claimed.body.postId}`)
      .set(authHeaders(owner.apiKey));
    expect(post.body.post.visibility).toBe("workspace");

    expect(await getAnonymousDoc(created.body.id)).toBeNull();
    const claimAgain = await request(app)
      .post("/api/v1/anonymous/claim")
      .set(authHeaders(owner.apiKey))
      .send({ claimToken: created.body.claimToken, workspaceId: owner.workspaceId });
    expect(claimAgain.status).toBe(404);
  });

  it("stops serving and refuses to claim expired documents", async () => {
    const app = await getTestApp();
    const created = await request(app)
      .post("/api/v1/anonymous/publish")
      .send({ markdown: "# Old news" });

    const { db: database, schema } = await db();
    await database
      .update(schema.anonymousDocs)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.anonymousDocs.id, created.body.id));

    const { getAnonymousDoc, getAnonymousDocByClaimToken } = await import(
      "@opendocs/shared/anonymous/service"
    );
    expect(await getAnonymousDocByClaimToken(created.body.claimToken)).toBeNull();
    expect(await getAnonymousDoc(created.body.id)).toBeNull();

    const owner = await createOnboardedUser();
    const claim = await request(app)
      .post("/api/v1/anonymous/claim")
      .set(authHeaders(owner.apiKey))
      .send({ claimToken: created.body.claimToken, workspaceId: owner.workspaceId });
    expect(claim.status).toBe(404);
  });

  it("caps anonymous document size", async () => {
    const app = await getTestApp();
    const res = await request(app)
      .post("/api/v1/anonymous/publish")
      .send({ markdown: `# Big\n\n${"x".repeat(520_000)}` });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/limited to 512 KB/);
  });
});

describe("versions, conflicts and unchanged republishes", () => {
  it("lists history, rejects stale updates, skips identical content and restores old versions", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser({ workspaceName: "History" });

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .set("X-OpenDocs-Client", "claude-code")
      .send({ markdown: "# Plan\n\nVersion one.", workspaceId: user.workspaceId });
    expect(published.status).toBe(201);
    expect(published.body.versionNumber).toBe(1);
    const postId = published.body.postId as string;

    const v2 = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .set("X-OpenDocs-Client", "cursor")
      .send({ markdown: "# Plan\n\nVersion two.", workspaceId: user.workspaceId, baseVersionNumber: 1 });
    expect(v2.status).toBe(200);
    expect(v2.body).toMatchObject({ versionNumber: 2, unchanged: false });

    const stale = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Plan\n\nOld base.", workspaceId: user.workspaceId, baseVersionNumber: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({
      error: "version_conflict",
      currentVersionNumber: 2,
      baseVersionNumber: 1,
    });

    const same = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Plan\n\nVersion two.", workspaceId: user.workspaceId, tags: ["Q3", "q3"] });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ unchanged: true, versionNumber: 2, tags: ["q3"] });

    const history = await request(app)
      .get(`/api/v1/posts/${postId}/versions`)
      .set(authHeaders(user.apiKey));
    expect(history.status).toBe(200);
    expect(history.body.versions.map((v: { versionNumber: number }) => v.versionNumber)).toEqual([2, 1]);
    expect(history.body.versions[0]).toMatchObject({ client: "cursor", isCurrent: true });
    expect(history.body.versions[1]).toMatchObject({ client: "claude-code", isCurrent: false });

    const v1Raw = await request(app)
      .get(`/api/v1/posts/${postId}/versions/1/raw`)
      .set(authHeaders(user.apiKey));
    expect(v1Raw.body.markdown).toBe("# Plan\n\nVersion one.");

    const restored = await request(app)
      .post(`/api/v1/posts/${postId}/versions/1/restore`)
      .set(authHeaders(user.apiKey));
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ versionNumber: 3, restoredFromVersion: 1 });

    const raw = await request(app).get(`/api/v1/posts/${postId}/raw`).set(authHeaders(user.apiKey));
    expect(raw.body).toMatchObject({ markdown: "# Plan\n\nVersion one.", versionNumber: 3 });

    const missing = await request(app)
      .post(`/api/v1/posts/${postId}/versions/99/restore`)
      .set(authHeaders(user.apiKey));
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe("version_not_found");

    const list = await request(app)
      .get("/api/v1/posts")
      .query({ workspaceId: user.workspaceId })
      .set(authHeaders(user.apiKey));
    expect(list.body.posts.find((p: { id: string }) => p.id === postId).versionNumber).toBe(3);
  });

  it("serves older versions, headings and search text to the web reader", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser({ workspaceName: "Reader" });
    const [{ getPostVersionContent }, workspaceService] = await Promise.all([
      import("@opendocs/shared/posts/versions"),
      import("@opendocs/shared/workspaces/service"),
    ]);

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({
        markdown:
          "# Guide\n\n## Install\n\nRun the **installer** from [the site](https://example.com).\n\n### Retry-After header\n\nBack off.\n",
        workspaceId: user.workspaceId,
        tags: ["setup"],
      });
    expect(published.status).toBe(201);
    const postId = published.body.postId as string;
    const slug = published.body.slug as string;

    const updated = await request(app)
      .post(`/api/v1/posts/${postId}/update`)
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Guide\n\n## Upgrade\n\nNew text.\n", workspaceId: user.workspaceId });
    expect(updated.body.versionNumber).toBe(2);

    const v1 = await getPostVersionContent(postId, 1);
    expect(v1).toMatchObject({ versionNumber: 1, readingMinutes: 1 });
    expect(v1!.renderedHtml).toContain("installer");
    expect(v1!.toc).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "install", level: 2 }),
        expect.objectContaining({ id: "retry-after-header", level: 3 }),
      ]),
    );
    expect(await getPostVersionContent(postId, 99)).toBeNull();

    const article = await workspaceService.getPostByWorkspaceSlugAndPostSlug(
      user.workspaceSlug,
      slug,
      user.userId,
    );
    expect(article).toMatchObject({ versionNumber: 2, canComment: true });
    expect(article!.toc.map((heading) => heading.id)).toContain("upgrade");

    await request(app)
      .post(`/api/v1/posts/${postId}/versions/1/restore`)
      .set(authHeaders(user.apiKey));
    const index = await workspaceService.getWorkspaceSearchIndex(user.workspaceSlug, user.userId);
    const item = index.items.find((entry) => entry.slug === slug);
    expect(item).toMatchObject({
      projectName: null,
      headings: [
        { id: "install", text: "Install" },
        { id: "retry-after-header", text: "Retry-After header" },
      ],
    });
    expect(item!.body).toContain("Run the installer from the site.");
    expect(item!.body).not.toMatch(/[#*[\]]/);

    const dashboard = await workspaceService.getDashboardData(user.userId, user.workspaceId);
    expect(dashboard.posts.find((post) => post.id === postId)).toMatchObject({
      projectName: expect.any(String),
      projectId: expect.any(String),
      publishedAt: expect.any(Date),
    });
  });

  it("handles very long titles and duplicate tags on publish", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();
    const longTitle = "Quarterly planning notes ".repeat(12).trim();

    const res = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({ markdown: `# ${longTitle}\n\nBody.`, workspaceId: user.workspaceId, tags: ["AI", "ai", "Ops"] });

    expect(res.status).toBe(201);
    expect(res.body.slug.length).toBeLessThanOrEqual(150);
    expect(res.body.title.length).toBeLessThanOrEqual(255);
    expect(res.body.tags).toEqual(["ai", "ops"]);
  });
});

describe("moving documents between projects", () => {
  it("moves without re-uploading and suffixes the slug on collision", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser({ workspaceName: "Movers" });

    const project = await request(app)
      .post("/api/v1/projects")
      .set(authHeaders(user.apiKey))
      .send({ workspaceId: user.workspaceId, name: "Client X" });
    expect(project.status).toBe(201);
    const projectSlug = project.body.project.slug as string;

    const inProject = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Brief", workspaceId: user.workspaceId, projectSlug });
    expect(inProject.status).toBe(201);
    const inDefault = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Brief", workspaceId: user.workspaceId });
    expect(inDefault.body.slug).toBe("brief");

    const moved = await request(app)
      .post(`/api/v1/posts/${inDefault.body.postId}/move`)
      .set(authHeaders(user.apiKey))
      .send({ projectSlug });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({
      moved: true,
      slug: "brief-2",
      previousSlug: "brief",
      url: `/${user.workspaceSlug}/projects/${projectSlug}/brief-2`,
    });

    const unknown = await request(app)
      .post(`/api/v1/posts/${inDefault.body.postId}/move`)
      .set(authHeaders(user.apiKey))
      .send({ projectSlug: "nope" });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe("project_not_found");
  });
});

describe("sharing documents with people outside the workspace", () => {
  it("grants read access to verified emails and domains only", async () => {
    const app = await getTestApp();
    const author = await createOnboardedUser({ workspaceName: "Sharers" });
    const doc = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(author.apiKey))
      .send({ markdown: "# Client brief\n\nConfidential.", workspaceId: author.workspaceId, visibility: "private" });
    const postId = doc.body.postId as string;

    const guestEmail = uniqueEmail("guest");
    const guest = await signUpWithCode(guestEmail);
    const read = () =>
      request(app).get(`/api/v1/posts/${postId}/raw`).set(authHeaders(guest.apiKey));

    expect((await read()).status).toBe(404);

    const shared = await request(app)
      .post(`/api/v1/posts/${postId}/share`)
      .set(authHeaders(author.apiKey))
      .send({ emails: [guestEmail.toUpperCase()] });
    expect(shared.status).toBe(200);
    expect(shared.body.emails).toEqual([guestEmail]);
    expect(shared.body.notified).toEqual([guestEmail]);

    expect((await read()).status).toBe(200);

    // An unverified account at the same address must not get in.
    const { db: database, schema } = await db();
    await database
      .update(schema.user)
      .set({ emailVerified: false })
      .where(eq(schema.user.id, guest.userId));
    expect((await read()).status).toBe(404);
    await database
      .update(schema.user)
      .set({ emailVerified: true })
      .where(eq(schema.user.id, guest.userId));

    const unshared = await request(app)
      .delete(`/api/v1/posts/${postId}/share`)
      .set(authHeaders(author.apiKey))
      .send({ emails: [guestEmail] });
    expect(unshared.body.emails).toEqual([]);
    expect((await read()).status).toBe(404);

    await request(app)
      .post(`/api/v1/posts/${postId}/share`)
      .set(authHeaders(author.apiKey))
      .send({ domains: [`@${guestEmail.split("@")[1]}`], notify: false });
    expect((await read()).status).toBe(200);

    const listed = await request(app)
      .get(`/api/v1/posts/${postId}/share`)
      .set(authHeaders(author.apiKey));
    expect(listed.body).toMatchObject({ emails: [], domains: [guestEmail.split("@")[1]] });

    // Guests can read but not manage sharing.
    const guestShares = await request(app)
      .post(`/api/v1/posts/${postId}/share`)
      .set(authHeaders(guest.apiKey))
      .send({ emails: ["someone@else.com"] });
    expect(guestShares.status).toBe(403);
  });
});

describe("agent-friendly workspace management and errors", () => {
  it("creates workspaces and invites teammates with an API key", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();

    const name = `Acme Research ${Date.now()}`;
    const atLimit = await request(app)
      .post("/api/v1/workspaces")
      .set(authHeaders(owner.apiKey))
      .send({ name });
    expect(atLimit.status).toBe(403);
    expect(atLimit.body).toMatchObject({ error: "plan_limit" });
    expect(atLimit.body.message).toMatch(/workspace limit/);

    const { db: database, schema } = await db();
    await database
      .update(schema.user)
      .set({ compedTier: "creator" })
      .where(eq(schema.user.id, owner.userId));

    const created = await request(app)
      .post("/api/v1/workspaces")
      .set(authHeaders(owner.apiKey))
      .send({ name });
    expect(created.status).toBe(201);
    expect(created.body.workspace.slug).toMatch(/^acme-research-\d+/);
    expect(created.body.defaultProject.slug).toBe("default");

    const invited = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(owner.apiKey))
      .send({ email: uniqueEmail("teammate"), role: "member", workspaceId: owner.workspaceId });
    expect(invited.status).toBe(201);

    const team = await request(app)
      .get("/api/v1/workspace/team")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(owner.apiKey));
    expect(team.status).toBe(200);
  });

  it("explains validation failures in one readable message", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser();

    const res = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(user.apiKey))
      .send({ markdown: "# Public", workspaceId: user.workspaceId, visibility: "public" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: "invalid_request",
      message: "confirmPublic: Public publishing requires explicit confirmation.",
      docs_url: "https://docs.opendocs.cc/errors#invalid-request",
    });
  });
});

describe("team management for agents", () => {
  async function teamPair() {
    const domain = `t${Date.now()}${++emailSequence}.agentteam.dev`;
    const admin = await signUpWithCode(`admin@${domain}`);
    const memberEmail = `dana@${domain}`;
    const member = await signUpWithCode(memberEmail);
    return { domain, admin, member, memberEmail };
  }

  it("lets an invitee list, accept and leave through the API, with admin tools on API keys", async () => {
    const app = await getTestApp();
    const { admin, member, memberEmail } = await teamPair();
    const ws = admin.workspace.id;

    const invited = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(admin.apiKey))
      .send({ email: memberEmail, role: "member", workspaceId: ws });
    expect(invited.status).toBe(201);

    const pending = await request(app)
      .get("/api/v1/workspace/team/invitations")
      .query({ workspaceId: ws })
      .set(authHeaders(admin.apiKey));
    expect(pending.status).toBe(200);
    expect(pending.body.invitations.map((i: { email: string }) => i.email)).toEqual([memberEmail]);

    const mine = await request(app).get("/api/v1/me/invitations").set(authHeaders(member.apiKey));
    expect(mine.status).toBe(200);
    expect(mine.body.invitations).toHaveLength(1);
    expect(mine.body.invitations[0]).toMatchObject({ workspaceId: ws, role: "member" });

    // An unverified account at the same address can't see or take it.
    const { db: database, schema } = await db();
    await database.update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, member.userId));
    const hidden = await request(app).get("/api/v1/me/invitations").set(authHeaders(member.apiKey));
    expect(hidden.body).toMatchObject({ emailVerified: false, invitations: [] });
    const blocked = await request(app)
      .post(`/api/v1/invitations/${mine.body.invitations[0].id}/accept`)
      .set(authHeaders(member.apiKey));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe("email_not_verified");
    await database.update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, member.userId));

    const accepted = await request(app)
      .post(`/api/v1/invitations/${mine.body.invitations[0].id}/accept`)
      .set(authHeaders(member.apiKey));
    expect(accepted.status).toBe(200);
    expect(accepted.body).toMatchObject({ workspace: { id: ws }, role: "member", alreadyMember: false });

    const team = await request(app).get("/api/v1/workspace/team").query({ workspaceId: ws }).set(authHeaders(admin.apiKey));
    const danaMembership = team.body.members.find((m: { email: string }) => m.email === memberEmail);
    expect(danaMembership).toBeTruthy();

    const promoted = await request(app)
      .patch(`/api/v1/workspace/team/members/${danaMembership.id}/role`)
      .set(authHeaders(admin.apiKey))
      .send({ role: "admin" });
    expect(promoted.status).toBe(200);

    const left = await request(app)
      .post("/api/v1/workspace/leave")
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: ws });
    expect(left.status).toBe(200);
    expect(left.body.remainingWorkspaces.map((w: { id: string }) => w.id)).toEqual([member.workspace.id]);

    const ownerLeave = await request(app)
      .post("/api/v1/workspace/leave")
      .set(authHeaders(admin.apiKey))
      .send({ workspaceId: ws });
    expect(ownerLeave.status).toBe(409);
    expect(ownerLeave.body.error).toBe("owner_cannot_leave");
  });

  it("lets admins revoke invites and invitees decline them", async () => {
    const app = await getTestApp();
    const { admin, member, memberEmail } = await teamPair();
    const ws = admin.workspace.id;

    const first = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(admin.apiKey))
      .send({ email: memberEmail, role: "member", workspaceId: ws });
    const revoked = await request(app)
      .delete(`/api/v1/workspace/team/invitations/${first.body.invitation.id}`)
      .set(authHeaders(admin.apiKey));
    expect(revoked.status).toBe(200);
    expect((await request(app).get("/api/v1/me/invitations").set(authHeaders(member.apiKey))).body.invitations).toEqual([]);

    const second = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(admin.apiKey))
      .send({ email: memberEmail, role: "member", workspaceId: ws });
    const declined = await request(app)
      .post(`/api/v1/invitations/${second.body.invitation.id}/decline`)
      .set(authHeaders(member.apiKey));
    expect(declined.status).toBe(200);
    const stranger = await signUpWithCode(uniqueEmail("stranger"));
    const third = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(admin.apiKey))
      .send({ email: memberEmail, role: "member", workspaceId: ws });
    const notTheirs = await request(app)
      .post(`/api/v1/invitations/${third.body.invitation.id}/accept`)
      .set(authHeaders(stranger.apiKey));
    expect(notTheirs.status).toBe(404);
  });

  it("supports email-domain auto-join with guardrails", async () => {
    const app = await getTestApp();
    const { domain, admin, member } = await teamPair();
    const ws = admin.workspace.id;

    const consumer = await request(app)
      .post("/api/v1/workspace/auto-join")
      .set(authHeaders(admin.apiKey))
      .send({ workspaceId: ws, domain: "gmail.com" });
    expect(consumer.status).toBe(400);
    expect(consumer.body.error).toBe("consumer_domain");

    const otherDomain = await request(app)
      .post("/api/v1/workspace/auto-join")
      .set(authHeaders(admin.apiKey))
      .send({ workspaceId: ws, domain: "someone-else.dev" });
    expect(otherDomain.status).toBe(403);
    expect(otherDomain.body.error).toBe("domain_mismatch");

    const added = await request(app)
      .post("/api/v1/workspace/auto-join")
      .set(authHeaders(admin.apiKey))
      .send({ workspaceId: ws, domain: `@${domain}` });
    expect(added.status).toBe(200);
    expect(added.body.domains.map((d: { domain: string }) => d.domain)).toEqual([domain]);

    const memberCantAdd = await request(app)
      .post("/api/v1/workspace/auto-join")
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: ws, domain });
    expect(memberCantAdd.status).toBe(404);

    const joinable = await request(app).get("/api/v1/me/invitations").set(authHeaders(member.apiKey));
    expect(joinable.body.joinable).toEqual([expect.objectContaining({ workspaceId: ws, domain })]);

    const joined = await request(app)
      .post(`/api/v1/workspaces/${admin.workspace.slug}/join`)
      .set(authHeaders(member.apiKey));
    expect(joined.status).toBe(200);
    expect(joined.body).toMatchObject({ workspace: { id: ws }, alreadyMember: false });

    const outsider = await signUpWithCode(uniqueEmail("outsider"));
    const refused = await request(app)
      .post(`/api/v1/workspaces/${admin.workspace.slug}/join`)
      .set(authHeaders(outsider.apiKey));
    expect(refused.status).toBe(404);

    const removed = await request(app)
      .delete("/api/v1/workspace/auto-join")
      .set(authHeaders(admin.apiKey))
      .send({ workspaceId: ws, domain });
    expect(removed.body.domains).toEqual([]);
  });

  it("lists recent titles per project without leaking teammates' private docs", async () => {
    const app = await getTestApp();
    const { admin, member, memberEmail } = await teamPair();
    const ws = admin.workspace.id;
    const invite = await request(app)
      .post("/api/v1/workspace/team/invite")
      .set(authHeaders(admin.apiKey))
      .send({ email: memberEmail, role: "member", workspaceId: ws });
    await request(app).post(`/api/v1/invitations/${invite.body.invitation.id}/accept`).set(authHeaders(member.apiKey));

    await request(app).post("/api/v1/publish").set(authHeaders(admin.apiKey))
      .send({ markdown: "# Launch plan", workspaceId: ws, projectSlug: "default" });
    await request(app).post("/api/v1/publish").set(authHeaders(admin.apiKey))
      .send({ markdown: "# Secret salaries", workspaceId: ws, visibility: "private" });

    const asMember = await request(app).get("/api/v1/projects").query({ workspaceId: ws }).set(authHeaders(member.apiKey));
    const defaultProject = asMember.body.projects.find((p: { isDefault: boolean }) => p.isDefault);
    expect(defaultProject.recentTitles).toEqual(["Launch plan"]);

    const asAdmin = await request(app).get("/api/v1/projects").query({ workspaceId: ws }).set(authHeaders(admin.apiKey));
    expect(asAdmin.body.projects.find((p: { isDefault: boolean }) => p.isDefault).recentTitles).toEqual([
      "Secret salaries",
      "Launch plan",
    ]);
  });
});

describe("export branding for agents", () => {
  it("reads branding with presets and rules, and gates changes on plan and contrast", async () => {
    const app = await getTestApp();
    const user = await createOnboardedUser({ workspaceName: "Brand" });
    const branding = (query = {}) =>
      request(app)
        .get("/api/v1/workspace/branding")
        .query({ workspaceId: user.workspaceId, ...query })
        .set(authHeaders(user.apiKey));
    const update = (body: Record<string, unknown>) =>
      request(app)
        .patch("/api/v1/workspace/branding")
        .set(authHeaders(user.apiKey))
        .send({ workspaceId: user.workspaceId, ...body });

    const initial = await branding();
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      role: "owner",
      tier: "free",
      canEdit: true,
      canEditFooter: false,
      branding: {
        brandColor: "#2E1C5C",
        font: "Arial",
        preset: "classic",
        // What Free exports actually print, whatever is stored.
        footer: { enabled: true, companyName: "OpenDocs", tagline: "Made with OpenDocs" },
      },
      guidelines: { minContrast: 4.5, recommendedContrast: 7 },
    });
    expect(initial.body.presets.map((p: { id: string }) => p.id)).toContain("editorial");
    expect(initial.body.fonts.map((f: { id: string }) => f.id)).toContain("Merriweather");

    // Free can brand its exports; only the footer is Pro.
    const freePreset = await update({ preset: "editorial" });
    expect(freePreset.status).toBe(200);
    expect(freePreset.body.branding).toMatchObject({ preset: "editorial" });
    const gated = await update({ footer: { companyName: "Brand Inc" } });
    expect(gated.status).toBe(403);
    expect(gated.body).toMatchObject({ error: "plan_required", tier: "free" });
    expect(gated.body.message).toContain("Made with OpenDocs");

    const { db: database, schema } = await db();
    await database
      .update(schema.user)
      .set({ compedTier: "creator" })
      .where(eq(schema.user.id, user.userId));

    const preset = await update({ preset: "Editorial" });
    expect(preset.status).toBe(200);
    expect(preset.body.branding).toMatchObject({
      brandColor: "#6E1F2A",
      font: "Vollkorn",
      preset: "editorial",
      contrast: { level: "great" },
    });

    const tooLight = await update({ brandColor: "#f5d90a" });
    expect(tooLight.status).toBe(400);
    expect(tooLight.body.error).toBe("low_contrast");
    expect(tooLight.body.contrast).toBeLessThan(4.5);
    expect(tooLight.body.message).toMatch(/too light/);

    const forced = await update({ brandColor: "f5d90a", allowLowContrast: true });
    expect(forced.status).toBe(200);
    expect(forced.body.branding).toMatchObject({
      brandColor: "#F5D90A",
      preset: null,
      contrast: { level: "too_light" },
    });

    const custom = await update({ brandColor: "#0B3D5C", font: "inter" });
    expect(custom.status).toBe(200);
    expect(custom.body.branding).toMatchObject({ brandColor: "#0B3D5C", font: "Inter" });

    const footer = await update({ footer: { tagline: "Made in Reykjavík", linkUrl: "fjord.example" } });
    expect(footer.status).toBe(200);
    expect(footer.body.branding.footer).toMatchObject({
      enabled: true,
      tagline: "Made in Reykjavík",
      linkUrl: "https://fjord.example",
    });

    const unknownFont = await update({ font: "Comic Sans" });
    expect(unknownFont.status).toBe(400);
    expect(unknownFont.body.fonts).toContain("Lato");

    const unknownPreset = await update({ preset: "neon" });
    expect(unknownPreset.status).toBe(400);
    expect(unknownPreset.body.presets).toContain("boardroom");

    const empty = await update({});
    expect(empty.status).toBe(400);
    expect(empty.body.error).toBe("nothing_to_change");

    const stranger = await createOnboardedUser({ workspaceName: "Elsewhere" });
    const notMember = await request(app)
      .get("/api/v1/workspace/branding")
      .query({ workspaceId: user.workspaceId })
      .set(authHeaders(stranger.apiKey));
    expect(notMember.status).toBe(404);
  });
});
