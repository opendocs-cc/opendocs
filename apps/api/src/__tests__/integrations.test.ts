import { createHash, createHmac, randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

type Onboarded = Awaited<ReturnType<typeof createOnboardedUser>>;

async function upgradeToPro(userId: string) {
  const [{ db }, { user }] = await Promise.all([import("@opendocs/shared/db"), import("@opendocs/shared/db/schema")]);
  if (!db) throw new Error("Database is not initialized.");
  await db.update(user).set({ plan: "pro" }).where(eq(user.id, userId));
}

async function publish(owner: Onboarded, title: string, markdown: string) {
  const app = await getTestApp();
  const res = await request(app)
    .post("/api/v1/publish")
    .set(authHeaders(owner.apiKey))
    .send({ title, markdown, workspaceId: owner.workspaceId, visibility: "workspace", tags: [] });
  if (res.status !== 201) throw new Error(`publish failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body as { postId: string; slug: string };
}

// ---- Fake DocuSeal and Google ---------------------------------------------

type Submission = {
  id: number;
  status: string;
  submitters: Array<Record<string, unknown>>;
  archived_at: string | null;
};

const docuseal = {
  submissions: new Map<number, Submission>(),
  created: [] as Array<Record<string, unknown>>,
  nextId: 100,
};
const drive = { uploads: [] as Array<{ metadata: Record<string, unknown>; content: Buffer }> };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function fakeProviders(realFetch: typeof fetch) {
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";

    if (url.hostname === "api.docuseal.com") {
      if ((init?.headers as Record<string, string>)["x-auth-token"] !== "ds_test_key") return json({ error: "Unauthorized" }, 401);
      if (url.pathname === "/templates") return json({ data: [] });
      if (url.pathname === "/user") return json({ email: "owner@example.com" });
      if (url.pathname === "/submissions/pdf" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { submitters: Array<Record<string, unknown>> };
        docuseal.created.push(body);
        const id = docuseal.nextId++;
        const submission: Submission = {
          id,
          status: "pending",
          archived_at: null,
          submitters: body.submitters.map((s, i) => ({ ...s, id: id * 10 + i, status: "sent" })),
        };
        docuseal.submissions.set(id, submission);
        return json(submission);
      }
      const match = /^\/submissions\/(\d+)$/.exec(url.pathname);
      if (match) {
        const submission = docuseal.submissions.get(Number(match[1]));
        if (!submission) return json({ error: "Not found" }, 404);
        if (method === "DELETE") submission.archived_at = new Date().toISOString();
        return json(submission);
      }
      return json({ error: "Not found" }, 404);
    }

    if (url.hostname === "oauth2.googleapis.com" && url.pathname === "/token") {
      return json({ access_token: "google-access", expires_in: 3600 });
    }
    if (url.hostname === "www.googleapis.com") {
      if (url.pathname === "/drive/v3/files/generateIds") return json({ ids: [`file-${drive.uploads.length + 1}`] });
      if (url.pathname === "/upload/drive/v3/files" && url.searchParams.get("uploadType") === "multipart") {
        // multipart/related: JSON metadata, then the file, between boundaries.
        const raw = Buffer.from(init?.body as Uint8Array);
        const boundary = /boundary=(.+)$/.exec((init?.headers as Record<string, string>)["content-type"])![1];
        const parts = raw.toString("latin1").split(`--${boundary}`);
        const metadata = JSON.parse(parts[1].split("\r\n\r\n")[1]) as Record<string, unknown>;
        const content = Buffer.from(parts[2].slice(parts[2].indexOf("\r\n\r\n") + 4, -2), "latin1");
        drive.uploads.push({ metadata, content });
        return json({
          id: metadata.id,
          name: metadata.name,
          webViewLink: `https://drive.google.com/file/d/${String(metadata.id)}/view`,
          sha256Checksum: createHash("sha256").update(content).digest("hex"),
          size: String(content.length),
        });
      }
      return json({ error: { message: "Not found" } }, 404);
    }

    return realFetch(input as Parameters<typeof fetch>[0], init);
  };
}

// ---------------------------------------------------------------------------

describe("integrations", () => {
  let converter: MockConverter;
  const saved = {
    converter: process.env.DOC_CONVERTER_URL,
    key: process.env.INTEGRATIONS_ENCRYPTION_KEY,
    driveId: process.env.GOOGLE_DRIVE_CLIENT_ID,
    driveSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  };
  let owner: Onboarded;

  beforeAll(async () => {
    converter = await startMockConverter();
    process.env.DOC_CONVERTER_URL = converter.url;
    process.env.INTEGRATIONS_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    process.env.GOOGLE_DRIVE_CLIENT_ID = "drive-client";
    process.env.GOOGLE_DRIVE_CLIENT_SECRET = "drive-secret";
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.spyOn(globalThis, "fetch").mockImplementation(fakeProviders(realFetch));

    owner = await createOnboardedUser();
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await converter.close();
    for (const [env, value] of [
      ["DOC_CONVERTER_URL", saved.converter],
      ["INTEGRATIONS_ENCRYPTION_KEY", saved.key],
      ["GOOGLE_DRIVE_CLIENT_ID", saved.driveId],
      ["GOOGLE_DRIVE_CLIENT_SECRET", saved.driveSecret],
    ] as const) {
      if (value === undefined) delete process.env[env];
      else process.env[env] = value;
    }
  });

  beforeEach(() => {
    converter.calls.length = 0;
    docuseal.created.length = 0;
    drive.uploads.length = 0;
  });

  it("is a Pro feature", async () => {
    const app = await getTestApp();
    const res = await request(app)
      .get(`/api/v1/integrations?workspaceId=${owner.workspaceId}`)
      .set(authHeaders(owner.apiKey));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("plan_required");
  });

  describe("on Pro", () => {
    let webhook: { path: string; token: string };

    beforeAll(async () => {
      await upgradeToPro(owner.userId);
      const { connectDocuSeal, getDocuSealSetup } = await import("@opendocs/shared/integrations/connections");
      const connected = await connectDocuSeal(owner.userId, owner.workspaceId, { region: "com", apiKey: "ds_test_key" });
      expect(connected).toEqual({ account: "owner@example.com", region: "com" });
      const setup = await getDocuSealSetup(owner.workspaceId, "http://api.test");
      const url = new URL(setup!.webhookUrl);
      webhook = { path: url.pathname, token: url.searchParams.get("token")! };
    });

    it("lists integrations with the default settings", async () => {
      const app = await getTestApp();
      const res = await request(app)
        .get(`/api/v1/integrations?workspaceId=${owner.workspaceId}`)
        .set(authHeaders(owner.apiKey));
      expect(res.status).toBe(200);
      expect(res.body.settings).toEqual({ usableBy: "members", signatureConfirmation: "chat" });
      const byId = Object.fromEntries(res.body.integrations.map((i: { provider: string }) => [i.provider, i]));
      expect(byId.docuseal).toMatchObject({ status: "connected", account: "owner@example.com", region: "com" });
      expect(byId.google_drive).toMatchObject({ status: "not_connected", destinations: [] });
      // Credentials never leave the server.
      expect(JSON.stringify(res.body)).not.toContain("ds_test_key");
    });

    it("rejects a DocuSeal key DocuSeal doesn't accept", async () => {
      const { connectDocuSeal } = await import("@opendocs/shared/integrations/connections");
      const result = await connectDocuSeal(owner.userId, owner.workspaceId, { region: "com", apiKey: "wrong" });
      expect(result).toMatchObject({ error: "invalid_key" });
    });

    it("drafts, confirms and sends a signature request", async () => {
      const app = await getTestApp();
      const post = await publish(owner, "Offer letter", "# Offer letter\n\nWelcome aboard.");

      const draft = await request(app)
        .post(`/api/v1/posts/${post.slug}/signature-requests`)
        .set(authHeaders(owner.apiKey))
        .set("x-opendocs-client", "claude-code")
        .send({
          workspaceId: owner.workspaceId,
          signers: [{ name: "John Adams", email: "Adams@Company.com" }],
          message: { subject: "Please sign" },
        });
      expect(draft.status).toBe(201);
      expect(draft.body).toMatchObject({
        status: "draft",
        document: { title: "Offer letter", versionNumber: 1 },
        signers: [{ name: "John Adams", email: "adams@company.com", role: "Signer 1", order: 1, status: "draft" }],
        confirmation: { mode: "chat" },
      });
      expect(draft.body.document.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(docuseal.created).toHaveLength(0);

      // The PDF was rendered with field tags and a signature block appended.
      expect(converter.calls).toHaveLength(1);
      const convertBody = converter.calls[0].body as { markdown: string; signature_fields?: boolean };
      expect(convertBody.signature_fields).toBe(true);
      expect(convertBody.markdown).toContain("```signature\n- role: Signer 1\n  name: John Adams\n```");

      // The draft PDF is exactly what was hashed.
      const pdf = await request(app)
        .get(`/api/v1/signature-requests/${draft.body.id}/documents/draft`)
        .set(authHeaders(owner.apiKey))
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => cb(null, Buffer.concat(chunks)));
        });
      expect(pdf.status).toBe(200);
      expect(createHash("sha256").update(pdf.body as Buffer).digest("hex")).toBe(draft.body.document.sha256);

      const unconfirmed = await request(app)
        .post(`/api/v1/signature-requests/${draft.body.id}/send`)
        .set(authHeaders(owner.apiKey))
        .send({});
      expect(unconfirmed.status).toBe(400);
      expect(unconfirmed.body.error).toBe("confirmation_required");
      expect(docuseal.created).toHaveLength(0);

      const sent = await request(app)
        .post(`/api/v1/signature-requests/${draft.body.id}/send`)
        .set(authHeaders(owner.apiKey))
        .send({ confirm: true, workspaceId: owner.workspaceId });
      expect(sent.status).toBe(200);
      expect(sent.body).toMatchObject({ status: "pending", confirmedVia: "chat" });
      expect(sent.body.signers[0].status).toBe("sent");
      expect(docuseal.created).toHaveLength(1);
      // No order given: everyone is emailed at once.
      expect(docuseal.created[0]).toMatchObject({
        order: "random",
        send_email: true,
        message: { subject: "Please sign" },
        submitters: [{ role: "Signer 1", name: "John Adams", email: "adams@company.com" }],
      });
      // A custom subject replaces DocuSeal's email, so the body must carry the signing link.
      expect((docuseal.created[0] as { message: { body: string } }).message.body).toContain("{{submitter.link}}");

      const again = await request(app)
        .post(`/api/v1/signature-requests/${draft.body.id}/send`)
        .set(authHeaders(owner.apiKey))
        .send({ confirm: true });
      expect(again.status).toBe(409);
      expect(again.body.error).toBe("already_sent");
      expect(docuseal.created).toHaveLength(1);

      // The draft PDF is gone once DocuSeal has it.
      const gone = await request(app)
        .get(`/api/v1/signature-requests/${draft.body.id}/documents/draft`)
        .set(authHeaders(owner.apiKey));
      expect(gone.status).toBe(404);
      expect(gone.body.error).toBe("not_available");
    });

    it("matches signers to the document's signature block", async () => {
      const app = await getTestApp();
      const post = await publish(
        owner,
        "Agreement",
        "# Agreement\n\nTerms.\n\n```signature\n- role: Employee\n- role: Company\n  name: Jane Doe\n```\n",
      );
      const tooFew = await request(app)
        .post(`/api/v1/posts/${post.postId}/signature-requests`)
        .set(authHeaders(owner.apiKey))
        .send({ signers: [{ name: "John Adams", email: "adams@company.com" }] });
      expect(tooFew.status).toBe(400);
      expect(tooFew.body).toMatchObject({ error: "signer_roles_mismatch", roles: ["Employee", "Company"] });
      expect(tooFew.body.message).toContain("Employee, Company");

      const ok = await request(app)
        .post(`/api/v1/posts/${post.postId}/signature-requests`)
        .set(authHeaders(owner.apiKey))
        .send({
          signers: [
            { name: "Jane Doe", email: "jane@company.com" },
            { name: "John Adams", email: "adams@company.com", role: "employee" },
          ],
        });
      expect(ok.status).toBe(201);
      expect(ok.body.signers.map((s: { name: string; role: string }) => [s.name, s.role])).toEqual([
        ["Jane Doe", "Company"],
        ["John Adams", "Employee"],
      ]);
      // The document already has a block, so nothing is appended.
      const convertBody = converter.calls[0].body as { markdown: string };
      expect(convertBody.markdown.match(/```signature/g)).toHaveLength(1);
    });

    it("refreshes a request from DocuSeal when a signed webhook arrives", async () => {
      const app = await getTestApp();
      const post = await publish(owner, "Minutes", "# Minutes\n\nApproved.");
      const draft = await request(app)
        .post(`/api/v1/posts/${post.postId}/signature-requests`)
        .set(authHeaders(owner.apiKey))
        .send({ signers: [{ name: "Jane Doe", email: "jane@company.com" }] });
      const sent = await request(app)
        .post(`/api/v1/signature-requests/${draft.body.id}/send`)
        .set(authHeaders(owner.apiKey))
        .send({ confirm: true });
      expect(sent.status).toBe(200);

      const submission = [...docuseal.submissions.values()].at(-1)!;
      submission.status = "completed";
      submission.submitters = submission.submitters.map((s) => ({
        ...s,
        status: "completed",
        completed_at: "2026-10-24T12:00:00Z",
      }));
      const event = JSON.stringify({ event_type: "submission.completed", data: { id: submission.id } });

      const forged = await request(app)
        .post(`${webhook.path}?token=wrong`)
        .set("content-type", "application/json")
        .send(event);
      expect(forged.status).toBe(401);

      // With a signing secret saved, the token alone isn't enough.
      const { updateDocuSealWebhookSecret } = await import("@opendocs/shared/integrations/connections");
      await updateDocuSealWebhookSecret(owner.userId, owner.workspaceId, "whsec_test");
      const unsigned = await request(app)
        .post(`${webhook.path}?token=${webhook.token}`)
        .set("content-type", "application/json")
        .send(event);
      expect(unsigned.status).toBe(401);

      const ts = Math.floor(Date.now() / 1000);
      const signature = createHmac("sha256", "whsec_test").update(`${ts}.${event}`).digest("hex");
      const delivered = await request(app)
        .post(`${webhook.path}?token=${webhook.token}`)
        .set("content-type", "application/json")
        .set("x-docuseal-signature", `${ts}.${signature}`)
        .send(event);
      expect(delivered.status).toBe(200);
      expect(delivered.body).toEqual({ ok: true, synced: draft.body.id });

      const status = await request(app)
        .get(`/api/v1/signature-requests/${draft.body.id}`)
        .set(authHeaders(owner.apiKey));
      expect(status.body).toMatchObject({ status: "completed", signers: [{ status: "completed" }] });
      await updateDocuSealWebhookSecret(owner.userId, owner.workspaceId, null);
    });

    it("lets only a person send when the workspace confirms in the browser", async () => {
      const { updateIntegrationSettings } = await import("@opendocs/shared/integrations/service");
      await updateIntegrationSettings(owner.userId, owner.workspaceId, { signatureConfirmation: "browser" });
      try {
        const app = await getTestApp();
        const post = await publish(owner, "Policy", "# Policy\n\nRead and sign.");
        const draft = await request(app)
          .post(`/api/v1/posts/${post.postId}/signature-requests`)
          .set(authHeaders(owner.apiKey))
          .send({ signers: [{ name: "Jane Doe", email: "jane@company.com" }] });
        expect(draft.body.confirmation.mode).toBe("browser");
        expect(draft.body.confirmation.approveUrl).toBe(
          `http://127.0.0.1:3000/dashboard/integrations/signatures/${draft.body.id}`,
        );

        const res = await request(app)
          .post(`/api/v1/signature-requests/${draft.body.id}/send`)
          .set(authHeaders(owner.apiKey))
          .send({ confirm: true });
        expect(res.status).toBe(403);
        expect(res.body).toMatchObject({ error: "approval_required", approveUrl: draft.body.confirmation.approveUrl });
        expect(docuseal.created).toHaveLength(0);

        // A signed-in person can.
        const { sendSignatureRequest } = await import("@opendocs/shared/integrations/signatures");
        const sent = await sendSignatureRequest({
          actor: { userId: owner.userId, authMethod: "session", client: "web" },
          requestId: draft.body.id,
        });
        expect(sent).toMatchObject({ status: "pending", confirmedVia: "browser" });
      } finally {
        await updateIntegrationSettings(owner.userId, owner.workspaceId, { signatureConfirmation: "chat" });
      }
    });

    it("still returns a draft whose last send failed, with the reason", async () => {
      const app = await getTestApp();
      const post = await publish(owner, "Retry", "# Retry\n\nx");
      const draft = await request(app)
        .post(`/api/v1/posts/${post.postId}/signature-requests`)
        .set(authHeaders(owner.apiKey))
        .send({ signers: [{ name: "Jane Doe", email: "jane@company.com" }] });
      const [{ db }, { signatureRequests }] = await Promise.all([
        import("@opendocs/shared/db"),
        import("@opendocs/shared/db/schema"),
      ]);
      await db!.update(signatureRequests).set({ error: "Not authenticated" }).where(eq(signatureRequests.id, draft.body.id));

      const res = await request(app)
        .get(`/api/v1/signature-requests/${draft.body.id}`)
        .set(authHeaders(owner.apiKey));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ status: "draft", lastError: "Not authenticated" });
      expect(res.body.error).toBeUndefined();
    });

    it("keeps other people's requests private", async () => {
      const app = await getTestApp();
      const post = await publish(owner, "Private", "# Private\n\nx");
      const draft = await request(app)
        .post(`/api/v1/posts/${post.postId}/signature-requests`)
        .set(authHeaders(owner.apiKey))
        .send({ signers: [{ name: "Jane Doe", email: "jane@company.com" }] });

      const stranger = await createOnboardedUser();
      await upgradeToPro(stranger.userId);
      for (const req of [
        request(app).get(`/api/v1/signature-requests/${draft.body.id}`),
        request(app).post(`/api/v1/signature-requests/${draft.body.id}/send`).send({ confirm: true }),
        request(app).get(`/api/v1/signature-requests/${draft.body.id}/documents/draft`),
      ]) {
        const res = await req.set(authHeaders(stranger.apiKey));
        expect(res.status).toBe(404);
      }
      // Nor can they draft one from the owner's document.
      const theirs = await request(app)
        .post(`/api/v1/posts/${post.postId}/signature-requests`)
        .set(authHeaders(stranger.apiKey))
        .send({ signers: [{ name: "Jane Doe", email: "jane@company.com" }] });
      expect(theirs.status).toBe(404);
    });

    it("saves a document to a named Drive folder", async () => {
      const app = await getTestApp();
      const { addDestination, saveConnection, getConnection } = await import("@opendocs/shared/integrations/service");
      await saveConnection({
        workspaceId: owner.workspaceId,
        provider: "google_drive",
        accountLabel: "owner@example.com",
        config: { email: "owner@example.com", sub: "123", scopes: [] },
        credentials: { refreshToken: "refresh" },
        userId: owner.userId,
      });
      const connection = await getConnection(owner.workspaceId, "google_drive");
      await addDestination({
        workspaceId: owner.workspaceId,
        integrationId: connection!.id,
        userId: owner.userId,
        name: "Board Minutes",
        externalId: "folder-1",
        externalName: "Stjórnarfundir",
        driveId: "drive-1",
        driveName: "Legal",
        url: null,
      });
      const post = await publish(owner, "Board minutes", "# Board minutes\n\nDecisions.");

      const missing = await request(app)
        .post(`/api/v1/posts/${post.slug}/storage`)
        .set(authHeaders(owner.apiKey))
        .send({ workspaceId: owner.workspaceId, destination: "Minutes" });
      expect(missing.status).toBe(404);
      expect(missing.body).toMatchObject({ error: "destination_not_found", destinations: ["Board Minutes"] });
      expect(converter.calls).toHaveLength(0);

      const res = await request(app)
        .post(`/api/v1/posts/${post.slug}/storage`)
        .set(authHeaders(owner.apiKey))
        .send({ workspaceId: owner.workspaceId, destination: "board minutes", format: "md" });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        provider: "google_drive",
        destination: { name: "Board Minutes" },
        document: { title: "Board minutes", versionNumber: 1 },
        file: { name: "Board minutes.md", format: "md", verified: true },
      });
      expect(drive.uploads).toHaveLength(1);
      expect(drive.uploads[0].metadata).toMatchObject({
        parents: ["folder-1"],
        appProperties: { odPostId: post.postId, odVersion: "1", odFormat: "md" },
      });
      expect(drive.uploads[0].content.toString("utf8")).toContain("Decisions.");
      expect(res.body.file.sha256).toBe(createHash("sha256").update(drive.uploads[0].content).digest("hex"));
    });

    it("rejects a signature message over 4000 characters instead of cutting it", async () => {
      const app = await getTestApp();
      const post = await publish(owner, "Long note", "# Long note\n\nx");
      const send = (body: string) =>
        request(app)
          .post(`/api/v1/posts/${post.postId}/signature-requests`)
          .set(authHeaders(owner.apiKey))
          .send({ signers: [{ name: "Dana Whitfield", email: "dana@halvard.example" }], message: { body } });

      const tooLong = await send("a".repeat(4001));
      expect(tooLong.status).toBe(400);
      expect(tooLong.body).toMatchObject({
        error: "invalid_request",
        message: "message.body: The message can be at most 4000 characters.",
      });
      expect(converter.calls).toHaveLength(0);

      const fits = await send("a".repeat(4000));
      expect(fits.status).toBe(201);
    });

    it("answers 502/504 like exports when the converter fails during a Drive save or signature draft", async () => {
      const app = await getTestApp();
      const user = await createOnboardedUser();
      await upgradeToPro(user.userId);
      const { addDestination, saveConnection, getConnection } = await import("@opendocs/shared/integrations/service");
      const { connectDocuSeal } = await import("@opendocs/shared/integrations/connections");
      await connectDocuSeal(user.userId, user.workspaceId, { region: "com", apiKey: "ds_test_key" });
      await saveConnection({
        workspaceId: user.workspaceId,
        provider: "google_drive",
        accountLabel: "owner@example.com",
        config: { email: "owner@example.com", sub: "456", scopes: [] },
        credentials: { refreshToken: "refresh" },
        userId: user.userId,
      });
      const connection = await getConnection(user.workspaceId, "google_drive");
      await addDestination({
        workspaceId: user.workspaceId,
        integrationId: connection!.id,
        userId: user.userId,
        name: "Contracts",
        externalId: "folder-2",
        externalName: "Contracts",
        driveId: "drive-2",
        driveName: "Legal",
        url: null,
      });
      const post = await publish(user, "Services agreement", "# Services agreement\n\nTerms.");
      const save = () =>
        request(app)
          .post(`/api/v1/posts/${post.postId}/storage`)
          .set(authHeaders(user.apiKey))
          .send({ destination: "Contracts", format: "pdf" });
      const draft = () =>
        request(app)
          .post(`/api/v1/posts/${post.postId}/signature-requests`)
          .set(authHeaders(user.apiKey))
          .send({ signers: [{ name: "Dana Whitfield", email: "dana@halvard.example" }] });

      converter.setHandler(() => ({ kind: "error", status: 500, body: "boom" }));
      try {
        for (const res of [await save(), await draft()]) {
          expect(res.status).toBe(502);
          expect(res.body).toMatchObject({ error: "export_failed", message: "Document converter failed." });
        }
      } finally {
        converter.setHandler(({ format, body }) => ({
          kind: "success",
          bytes: Buffer.from(`mock-${format}`),
          filename: `${(body as { filename?: string }).filename ?? "document"}.${format}`,
        }));
      }

      // A converter that doesn't answer in time aborts the request.
      const fetchSpy = vi.mocked(globalThis.fetch);
      const providers = fetchSpy.getMockImplementation()!;
      fetchSpy.mockImplementation(async (input, init) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.startsWith(converter.url)) {
          throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
        }
        return providers(input, init);
      });
      try {
        for (const res of [await save(), await draft()]) {
          expect(res.status).toBe(504);
          expect(res.body.error).toBe("export_timeout");
        }
      } finally {
        fetchSpy.mockImplementation(providers);
      }
      expect(drive.uploads).toHaveLength(0);
    });
  });
});
