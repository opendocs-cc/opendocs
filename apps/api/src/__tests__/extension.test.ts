import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

// The browser extension's side of the API: CORS for its origin, PDFs of
// anonymous documents, failure pings and the uninstall question.

const EXTENSION_ORIGIN = "chrome-extension://pmpocloilkjljlpelbkngppeaagmaccc";

let ipSequence = 0;
function nextIp() {
  ipSequence += 1;
  return `203.0.${Math.floor(ipSequence / 250)}.${(ipSequence % 250) + 1}`;
}

type TelegramCall = { method: string; body: Record<string, unknown> };

describe("browser extension", () => {
  let converter: MockConverter;
  const originalConverterUrl = process.env.DOC_CONVERTER_URL;
  const telegram: TelegramCall[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    converter = await startMockConverter();
    process.env.DOC_CONVERTER_URL = converter.url;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://api.telegram.org/")) return realFetch(input, init);
      telegram.push({
        method: url.split("/").pop() ?? "",
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await converter.close();
    if (originalConverterUrl === undefined) delete process.env.DOC_CONVERTER_URL;
    else process.env.DOC_CONVERTER_URL = originalConverterUrl;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_ID;
  });

  beforeEach(async () => {
    converter.calls.length = 0;
    telegram.length = 0;
    const { resetExtensionFailures } = await import("../routes/extension");
    resetExtensionFailures();
  });

  describe("CORS", () => {
    it("answers the extension's origin without credentials", async () => {
      const app = await getTestApp();
      const res = await request(app)
        .options("/api/v1/anonymous/publish")
        .set("Origin", EXTENSION_ORIGIN)
        .set("Access-Control-Request-Method", "POST")
        .set("Access-Control-Request-Headers", "content-type,x-opendocs-client");
      expect(res.status).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe(EXTENSION_ORIGIN);
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
      expect(res.headers["access-control-allow-headers"]).toMatch(/X-OpenDocs-Client/i);
    });

    it("ignores other extensions", async () => {
      const app = await getTestApp();
      const res = await request(app)
        .options("/api/v1/anonymous/publish")
        .set("Origin", "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
        .set("Access-Control-Request-Method", "POST");
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
    });

    it("accepts extension IDs added through EXTENSION_IDS", async () => {
      process.env.EXTENSION_IDS = "abcdefghijklmnopabcdefghijklmnop";
      try {
        const app = await getTestApp();
        const res = await request(app)
          .options("/api/v1/posts")
          .set("Origin", "chrome-extension://abcdefghijklmnopabcdefghijklmnop")
          .set("Access-Control-Request-Method", "GET");
        expect(res.headers["access-control-allow-origin"]).toBe("chrome-extension://abcdefghijklmnopabcdefghijklmnop");
      } finally {
        delete process.env.EXTENSION_IDS;
      }
    });
  });

  describe("which extension IDs are trusted", () => {
    const DEV_ID = "pmpocloilkjljlpelbkngppeaagmaccc";
    const STORE_ID = "lhknacncecjennlcpdbfebdgnbdifbnc";
    const originalNodeEnv = process.env.NODE_ENV;

    async function withEnv<T>(env: { NODE_ENV: string; EXTENSION_IDS?: string }, run: () => Promise<T>): Promise<T> {
      process.env.NODE_ENV = env.NODE_ENV;
      if (env.EXTENSION_IDS === undefined) delete process.env.EXTENSION_IDS;
      else process.env.EXTENSION_IDS = env.EXTENSION_IDS;
      try {
        return await run();
      } finally {
        process.env.NODE_ENV = originalNodeEnv;
        delete process.env.EXTENSION_IDS;
      }
    }

    const config = () => import("@opendocs/shared/extension/config");

    it("trusts the development ID outside production, alongside EXTENSION_IDS", async () => {
      const { extensionIds, extensionRedirectUris, isExtensionOrigin } = await config();
      for (const nodeEnv of ["development", "test"]) {
        await withEnv({ NODE_ENV: nodeEnv, EXTENSION_IDS: STORE_ID }, async () => {
          expect(extensionIds()).toEqual([DEV_ID, STORE_ID]);
          expect(isExtensionOrigin(`chrome-extension://${DEV_ID}`)).toBe(true);
          expect(extensionRedirectUris()).toContain(`https://${DEV_ID}.chromiumapp.org/`);
        });
      }
    });

    it("trusts only EXTENSION_IDS in production", async () => {
      const { extensionIds, extensionOrigins, extensionRedirectUris, isExtensionOrigin } = await config();
      await withEnv({ NODE_ENV: "production", EXTENSION_IDS: ` ${STORE_ID} , not-an-id` }, async () => {
        expect(extensionIds()).toEqual([STORE_ID]);
        expect(extensionOrigins()).toEqual([`chrome-extension://${STORE_ID}`]);
        expect(extensionRedirectUris()).toEqual([`https://${STORE_ID}.chromiumapp.org/`]);
        expect(isExtensionOrigin(`chrome-extension://${STORE_ID}`)).toBe(true);
        expect(isExtensionOrigin(`chrome-extension://${DEV_ID}`)).toBe(false);
      });
      await withEnv({ NODE_ENV: "production" }, async () => {
        expect(extensionIds()).toEqual([]);
      });
    });

    it("answers CORS for the store ID but not the development ID in production", async () => {
      const app = await getTestApp();
      const preflight = (id: string) =>
        request(app)
          .options("/api/v1/anonymous/publish")
          .set("X-Forwarded-For", "203.0.113.250")
          .set("Origin", `chrome-extension://${id}`)
          .set("Access-Control-Request-Method", "POST")
          .set("Access-Control-Request-Headers", "content-type,x-opendocs-client");

      await withEnv({ NODE_ENV: "production", EXTENSION_IDS: STORE_ID }, async () => {
        const store = await preflight(STORE_ID);
        expect(store.status).toBe(204);
        expect(store.headers["access-control-allow-origin"]).toBe(`chrome-extension://${STORE_ID}`);
        expect(store.headers["access-control-allow-credentials"]).toBeUndefined();

        const dev = await preflight(DEV_ID);
        expect(dev.headers["access-control-allow-origin"]).toBeUndefined();
      });

      // Outside production the development build still works.
      const dev = await preflight(DEV_ID);
      expect(dev.headers["access-control-allow-origin"]).toBe(`chrome-extension://${DEV_ID}`);
    });
  });

  describe("PDF of an anonymous document", () => {
    it("converts the live document with a footer that points to the extension", async () => {
      const app = await getTestApp();
      const created = await request(app)
        .post("/api/v1/anonymous/publish")
        .set("X-Forwarded-For", nextIp())
        .set("X-OpenDocs-Client", "opendocs-extension/chatgpt")
        .send({ markdown: "# Þróun áætlunar\n\nFrom a chat." });
      expect(created.status).toBe(201);

      const res = await request(app)
        .get(`/api/v1/anonymous/${created.body.id}/export/pdf`)
        .set("X-Forwarded-For", nextIp());
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/application\/pdf/);
      expect(res.headers["content-disposition"]).toMatch(/^attachment; filename="/);
      expect(converter.calls).toHaveLength(1);
      const body = converter.calls[0]!.body as {
        markdown: string;
        branding: { footer_subtitle: string; company_url: string; company_url_label: string };
      };
      expect(body.markdown).toContain("From a chat.");
      expect(body.branding).toMatchObject({
        footer_subtitle: "Made with OpenDocs for Chrome",
        company_url: "https://opendocs.cc/extension?utm_source=tool&utm_medium=export&utm_content=extension",
        company_url_label: "opendocs.cc/extension",
      });
    });

    it("is 404 for documents that don't exist", async () => {
      const app = await getTestApp();
      const res = await request(app)
        .get("/api/v1/anonymous/doesnotexist000000000/export/pdf")
        .set("X-Forwarded-For", nextIp());
      expect(res.status).toBe(404);
      expect(converter.calls).toHaveLength(0);
    });
  });

  describe("failure pings", () => {
    const ping = async (ip: string, body: Record<string, unknown> = {}) => {
      const app = await getTestApp();
      return request(app)
        .post("/api/v1/extension/events")
        .set("X-Forwarded-For", ip)
        .send({ site: "chatgpt", stage: "extract-api", code: "http_404", version: "1.0.0", ...body });
    };

    it("accepts a content-free event and rejects anything else", async () => {
      expect((await ping(nextIp())).status).toBe(204);
      expect((await ping(nextIp(), { site: "example.com" })).status).toBe(400);
      expect((await ping(nextIp(), { code: "has spaces and <html>" })).status).toBe(400);
    });

    it("tells the owner once several people hit the same site", async () => {
      process.env.TELEGRAM_BOT_TOKEN = "test-token";
      process.env.TELEGRAM_OWNER_ID = "7043577976";
      for (let i = 0; i < 3; i++) await ping(nextIp());
      // The same person again doesn't count twice: four people so far.
      const repeat = nextIp();
      await ping(repeat);
      await ping(repeat);
      expect(telegram).toHaveLength(0);

      await ping(nextIp());
      await vi.waitFor(() => expect(telegram).toHaveLength(1));
      expect(String(telegram[0]!.body.text)).toMatch(/chatgpt is failing for 5 people/);

      // Then it stays quiet for a while.
      for (let i = 0; i < 5; i++) await ping(nextIp());
      expect(telegram).toHaveLength(1);
    });
  });

  it("stores uploaded image bytes in the caller's workspace", async () => {
    const r2 = await import("@opendocs/shared/storage/r2");
    vi.spyOn(r2, "isStorageConfigured").mockReturnValue(true);
    const upload = vi
      .spyOn(r2, "uploadObject")
      .mockImplementation(async ({ key }) => ({ url: `https://assets.opendocs.cc/${key}`, key }));
    const owner = await createOnboardedUser();
    const stranger = await createOnboardedUser();
    const app = await getTestApp();
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const res = await request(app)
      .post(`/api/v1/storage/images?workspaceId=${owner.workspaceId}&filename=chart.png`)
      .set(authHeaders(owner.apiKey))
      .set("Content-Type", "image/png")
      .send(png);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(new RegExp(`^https://assets\\.opendocs\\.cc/posts/${owner.workspaceId}/images/[^/]+\\.png$`));
    expect(upload).toHaveBeenCalledOnce();

    const foreign = await request(app)
      .post(`/api/v1/storage/images?workspaceId=${owner.workspaceId}`)
      .set(authHeaders(stranger.apiKey))
      .set("Content-Type", "image/png")
      .send(png);
    expect(foreign.status).toBe(403);

    const notImage = await request(app)
      .post(`/api/v1/storage/images?workspaceId=${owner.workspaceId}`)
      .set(authHeaders(owner.apiKey))
      .set("Content-Type", "text/html")
      .send(Buffer.from("<script>"));
    expect(notImage.status).toBe(400);
    expect(upload).toHaveBeenCalledOnce();
  });

  it("forwards the uninstall answer", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "test-token";
    process.env.TELEGRAM_OWNER_ID = "7043577976";
    const app = await getTestApp();
    const res = await request(app)
      .post("/api/v1/extension/feedback")
      .set("X-Forwarded-For", nextIp())
      .send({ reason: "formatting", details: "Tables looked off" });
    expect(res.status).toBe(202);
    await vi.waitFor(() => expect(telegram).toHaveLength(1));
    expect(String(telegram[0]!.body.text)).toMatch(/Tables looked off/);

    const bad = await request(app).post("/api/v1/extension/feedback").set("X-Forwarded-For", nextIp()).send({ reason: "nope" });
    expect(bad.status).toBe(400);
  });
});
