import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

import { FREE_TOOL_LIMITS } from "@opendocs/shared/config/free-tools";
import {
  FREE_TOOL_ENV,
  anonymousPublishGlobalLimits,
  converterGlobalLimits,
  hideAfterDistinctReporters,
} from "@opendocs/shared/config/free-tools-env";
import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

// The no-account surfaces: the free converter, anonymous publishing and
// reports on anonymous pages. Limiters are skipped in tests by default; this
// suite opts in and gives every test its own client addresses, and resets
// the global (all-clients) buckets between tests.

const OWNER = "7043577976";

let ipSequence = 0;
/** A fresh documentation-range address per call, so per-IP buckets never bleed. */
function nextIp() {
  ipSequence += 1;
  return `198.51.${Math.floor(ipSequence / 250)}.${(ipSequence % 250) + 1}`;
}

const original = structuredClone(FREE_TOOL_LIMITS);
function restoreLimits() {
  Object.assign(FREE_TOOL_LIMITS.converter.perIp, original.converter.perIp);
  Object.assign(FREE_TOOL_LIMITS.converter.global, original.converter.global);
  Object.assign(FREE_TOOL_LIMITS.anonymousPublish.perIp, original.anonymousPublish.perIp);
  Object.assign(FREE_TOOL_LIMITS.anonymousPublish.global, original.anonymousPublish.global);
  Object.assign(FREE_TOOL_LIMITS.reports.perIp, original.reports.perIp);
  FREE_TOOL_LIMITS.reports.hideAfterDistinctReporters = original.reports.hideAfterDistinctReporters;
}

async function resetGlobalBuckets() {
  const limits = await import("../middleware/rate-limit");
  for (const limiter of [
    limits.publicConvertGlobalMinuteLimit,
    limits.publicConvertGlobalHourlyLimit,
    limits.anonymousPublishGlobalMinuteLimit,
    limits.anonymousPublishGlobalHourlyLimit,
    limits.anonymousPublishGlobalDailyLimit,
  ]) {
    await limiter.resetKey("global");
  }
}

async function db() {
  const [{ db: database }, schema] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!database) throw new Error("Database is not initialized.");
  return { database, schema };
}

type TelegramCall = { method: string; body: Record<string, unknown> };

describe("free tools", () => {
  let converter: MockConverter;
  const originalConverterUrl = process.env.DOC_CONVERTER_URL;
  const telegram: TelegramCall[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(async () => {
    converter = await startMockConverter();
    process.env.DOC_CONVERTER_URL = converter.url;
    process.env.OPENDOCS_TEST_RATE_LIMITS = "true";
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
    delete process.env.OPENDOCS_TEST_RATE_LIMITS;
    await converter.close();
    if (originalConverterUrl === undefined) delete process.env.DOC_CONVERTER_URL;
    else process.env.DOC_CONVERTER_URL = originalConverterUrl;
  });

  beforeEach(async () => {
    converter.calls.length = 0;
    telegram.length = 0;
    await resetGlobalBuckets();
  });

  afterEach(() => {
    restoreLimits();
    for (const name of Object.values(FREE_TOOL_ENV)) delete process.env[name];
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_ID;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  const convert = async (
    options: { ip?: string; text?: string; filename?: string; fields?: Record<string, string> } = {},
  ) => {
    const app = await getTestApp();
    const req = request(app)
      .post("/api/v1/tools/convert/pdf")
      .set("X-Forwarded-For", options.ip ?? nextIp());
    for (const [key, value] of Object.entries(options.fields ?? {})) req.field(key, value);
    return req.attach("file", Buffer.from(options.text ?? "# Pasted\n\nHello."), {
      filename: options.filename ?? "pasted.md",
      contentType: "text/markdown",
    });
  };

  const publish = async (options: { ip?: string; markdown?: string; extra?: Record<string, unknown> } = {}) => {
    const app = await getTestApp();
    return request(app)
      .post("/api/v1/anonymous/publish")
      .set("X-Forwarded-For", options.ip ?? nextIp())
      .send({ markdown: options.markdown ?? "# Shared\n\nHello.", ...options.extra });
  };

  const report = async (id: string, options: { ip?: string; body?: Record<string, unknown> } = {}) => {
    const app = await getTestApp();
    return request(app)
      .post(`/api/v1/anonymous/${id}/report`)
      .set("X-Forwarded-For", options.ip ?? nextIp())
      .send(options.body ?? { reason: "phishing" });
  };

  describe("converter input", () => {
    it("converts pasted text sent as a .md file and tags the footer link with the tool", async () => {
      const res = await convert({
        filename: "chatgpt-answer.md",
        fields: { tool: "chatgpt-to-pdf", elapsed_ms: "4200", website: "" },
      });
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pdf");
      expect(res.headers["content-disposition"]).toContain("chatgpt-answer.pdf");

      const body = converter.calls[0].body as { markdown: string; filename: string; branding: Record<string, unknown> };
      expect(body.markdown).toBe("# Pasted\n\nHello.");
      expect(body.filename).toBe("chatgpt-answer");
      expect(body.branding).toMatchObject({
        company_name: "OpenDocs",
        footer_subtitle: "Made with OpenDocs",
        company_url: "https://opendocs.cc/?utm_source=tool&utm_medium=export&utm_content=chatgpt-to-pdf",
        company_url_label: "opendocs.cc",
      });
    });

    it("tags conversions from unknown or missing tools as the generic converter", async () => {
      await convert({ fields: { tool: "https://evil.example" } });
      await convert();
      expect(converter.calls.map((call) => (call.body as { branding: { company_url: string } }).branding.company_url)).toEqual([
        "https://opendocs.cc/?utm_source=tool&utm_medium=export&utm_content=free-converter",
        "https://opendocs.cc/?utm_source=tool&utm_medium=export&utm_content=free-converter",
      ]);
    });

    it("rejects empty, blank and oversized text", async () => {
      const empty = await convert({ text: "" });
      expect(empty.status).toBe(400);

      const blank = await convert({ text: "  \n\t\n" });
      expect(blank.status).toBe(400);
      expect(blank.body).toMatchObject({ error: "empty_file", message: expect.stringContaining("empty") });

      const tooLarge = await convert({ text: "x".repeat(FREE_TOOL_LIMITS.converter.maxBytes + 1) });
      expect(tooLarge.status).toBe(413);
      expect(tooLarge.body).toMatchObject({ error: "file_too_large", message: "Markdown can be at most 2 MB." });
      expect(converter.calls).toHaveLength(0);
    });

    it("quietly rejects a filled honeypot or a form sent faster than a person could", async () => {
      const honeypot = await convert({ fields: { website: "http://cheap-pills.example", elapsed_ms: "5000" } });
      expect(honeypot.status).toBe(400);
      expect(honeypot.body).toMatchObject({
        error: "invalid_request",
        message: "We couldn't accept that. Wait a moment and try again.",
      });

      const tooFast = await convert({ fields: { website: "", elapsed_ms: "120" } });
      expect(tooFast.status).toBe(400);
      expect(tooFast.body.message).toBe(honeypot.body.message);

      const notANumber = await convert({ fields: { elapsed_ms: "soon" } });
      expect(notANumber.status).toBe(400);
      expect(converter.calls).toHaveLength(0);

      // A person who clicked too fast just tries again.
      const human = await convert({ fields: { website: "", elapsed_ms: "1500" } });
      expect(human.status).toBe(200);
    });
  });

  describe("converter limits", () => {
    it("caps each address per day, on top of the per-minute and per-hour caps", async () => {
      Object.assign(FREE_TOOL_LIMITS.converter.perIp, { perMinute: 100, perHour: 100, perDay: 3 });
      const ip = nextIp();
      for (let i = 0; i < 3; i += 1) expect((await convert({ ip })).status).toBe(200);

      const blocked = await convert({ ip });
      expect(blocked.status).toBe(429);
      expect(blocked.body).toMatchObject({ error: "rate_limited", message: expect.stringContaining("today's limit") });
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(3600);
      expect(converter.calls).toHaveLength(3);

      expect((await convert()).status).toBe(200);
    });

    it("keeps the burst and hourly caps and says which one was hit", async () => {
      const ip = nextIp();
      for (let i = 0; i < FREE_TOOL_LIMITS.converter.perIp.perMinute; i += 1) {
        expect((await convert({ ip })).status).toBe(200);
      }
      const burst = await convert({ ip });
      expect(burst.status).toBe(429);
      expect(burst.body.message).toBe("Too many conversions. Wait a minute and try again.");

      Object.assign(FREE_TOOL_LIMITS.converter.perIp, { perMinute: 100, perHour: 2 });
      const other = nextIp();
      await convert({ ip: other });
      await convert({ ip: other });
      const hourly = await convert({ ip: other });
      expect(hourly.status).toBe(429);
      expect(hourly.body.message).toContain("this hour's limit");
    });

    it("trips a global circuit breaker across all addresses with a 503", async () => {
      FREE_TOOL_LIMITS.converter.global.perMinute = 3;

      // Requests that fail anyway don't use up the shared budget.
      for (let i = 0; i < 4; i += 1) expect((await convert({ text: " " })).status).toBe(400);
      expect((await convert({ fields: { website: "bot" } })).status).toBe(400);

      for (let i = 0; i < 3; i += 1) expect((await convert()).status).toBe(200);

      const busy = await convert();
      expect(busy.status).toBe(503);
      expect(busy.body).toMatchObject({
        error: "service_busy",
        message: expect.stringContaining("The free converter is busy right now"),
        docs_url: "https://docs.opendocs.cc/errors#service-busy",
      });
      expect(Number(busy.headers["retry-after"])).toBeGreaterThan(0);
      expect(Number(busy.headers["retry-after"])).toBeLessThanOrEqual(60);
      // The breaker doesn't advertise how much shared room is left: the only
      // RateLimit headers are the general per-IP limit's.
      expect(busy.headers["ratelimit-limit"]).toBe("600");
      expect(converter.calls).toHaveLength(3);

      // Docx shares the budget.
      const app = await getTestApp();
      const docx = await request(app)
        .post("/api/v1/tools/convert/docx")
        .set("X-Forwarded-For", nextIp())
        .attach("file", Buffer.from("# Hi"), { filename: "a.md", contentType: "text/markdown" });
      expect(docx.status).toBe(503);
    });

    it("has an hourly global ceiling too", async () => {
      FREE_TOOL_LIMITS.converter.global.perHour = 2;
      expect((await convert()).status).toBe(200);
      expect((await convert()).status).toBe(200);
      const busy = await convert();
      expect(busy.status).toBe(503);
      expect(Number(busy.headers["retry-after"])).toBeGreaterThan(60);
    });

    it("lets production override the global breaker through the environment", async () => {
      process.env.FREE_CONVERTER_GLOBAL_PER_MINUTE = "2";
      expect((await convert()).status).toBe(200);
      expect((await convert()).status).toBe(200);
      expect((await convert()).status).toBe(503);
    });
  });

  describe("threshold overrides from the environment", () => {
    it("uses FREE_TOOL_LIMITS when nothing is set", () => {
      expect(converterGlobalLimits()).toEqual(FREE_TOOL_LIMITS.converter.global);
      expect(anonymousPublishGlobalLimits()).toEqual(FREE_TOOL_LIMITS.anonymousPublish.global);
      expect(hideAfterDistinctReporters()).toBe(FREE_TOOL_LIMITS.reports.hideAfterDistinctReporters);
      expect(converterGlobalLimits()).toEqual({ perMinute: 30, perHour: 600 });
      expect(anonymousPublishGlobalLimits()).toEqual({ perMinute: 60, perHour: 1000, perDay: 5000 });
      expect(hideAfterDistinctReporters()).toBe(3);
    });

    it("overrides each threshold with its variable", () => {
      Object.assign(process.env, {
        FREE_CONVERTER_GLOBAL_PER_MINUTE: "45",
        FREE_CONVERTER_GLOBAL_PER_HOUR: "900",
        ANONYMOUS_PUBLISH_GLOBAL_PER_MINUTE: "120",
        ANONYMOUS_PUBLISH_GLOBAL_PER_HOUR: " 2000 ",
        ANONYMOUS_PUBLISH_GLOBAL_PER_DAY: "10000",
        ANONYMOUS_REPORTS_HIDE_AFTER: "5",
      });
      expect(converterGlobalLimits()).toEqual({ perMinute: 45, perHour: 900 });
      expect(anonymousPublishGlobalLimits()).toEqual({ perMinute: 120, perHour: 2000, perDay: 10000 });
      expect(hideAfterDistinctReporters()).toBe(5);
    });

    it("ignores empty and invalid values", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      Object.assign(process.env, {
        FREE_CONVERTER_GLOBAL_PER_MINUTE: "",
        FREE_CONVERTER_GLOBAL_PER_HOUR: "lots",
        ANONYMOUS_PUBLISH_GLOBAL_PER_MINUTE: "0",
        ANONYMOUS_PUBLISH_GLOBAL_PER_HOUR: "-5",
        ANONYMOUS_PUBLISH_GLOBAL_PER_DAY: "1.5",
      });
      expect(converterGlobalLimits()).toEqual({ perMinute: 30, perHour: 600 });
      expect(anonymousPublishGlobalLimits()).toEqual({ perMinute: 60, perHour: 1000, perDay: 5000 });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe("client addresses", () => {
    it("counts the address Caddy saw, not entries a client adds to X-Forwarded-For", async () => {
      Object.assign(FREE_TOOL_LIMITS.converter.perIp, { perMinute: 100, perHour: 100, perDay: 1 });
      const real = nextIp();
      expect((await convert({ ip: `10.0.0.1, ${real}` })).status).toBe(200);
      // A spoofed left-most entry doesn't buy a new bucket.
      expect((await convert({ ip: `10.9.9.9, ${real}` })).status).toBe(429);
    });

    it("buckets IPv6 clients by /56", async () => {
      Object.assign(FREE_TOOL_LIMITS.converter.perIp, { perMinute: 100, perHour: 100, perDay: 1 });
      expect((await convert({ ip: "2001:db8:abcd:1200::1" })).status).toBe(200);
      expect((await convert({ ip: "2001:db8:abcd:12ff:ffff::2" })).status).toBe(429);
      expect((await convert({ ip: "2001:db8:abcd:1300::1" })).status).toBe(200);
    });

    it("normalises addresses into rate-limit keys", async () => {
      const { clientAddressKey } = await import("../middleware/rate-limit");
      expect(clientAddressKey("203.0.113.9")).toBe("203.0.113.9");
      expect(clientAddressKey("::ffff:203.0.113.9")).toBe("203.0.113.9");
      expect(clientAddressKey("2001:db8:abcd:12ff:1:2:3:4")).toBe("2001:db8:abcd:1200::/56");
      expect(clientAddressKey("2001:DB8:ABCD:12AB::")).toBe("2001:db8:abcd:1200::/56");
      expect(clientAddressKey("::1")).toBe("0:0:0:0::/56");
      expect(clientAddressKey(undefined)).toBe("unknown");
    });
  });

  describe("anonymous publishing", () => {
    it("rejects blank Markdown and bot-filled forms, and still works for agents", async () => {
      const blank = await publish({ markdown: "   \n  " });
      expect(blank.status).toBe(400);
      expect(blank.body.message).toContain("empty");

      const honeypot = await publish({ extra: { website: "spam", elapsed_ms: 9000 } });
      expect(honeypot.status).toBe(400);
      expect(honeypot.body.message).toBe("We couldn't accept that. Wait a moment and try again.");
      const tooFast = await publish({ extra: { website: "", elapsed_ms: 50 } });
      expect(tooFast.status).toBe(400);

      // The tool page's fields, filled the way a person fills them...
      const fromPage = await publish({ extra: { website: "", elapsed_ms: 3000 } });
      expect(fromPage.status).toBe(201);
      // ...and the CLI, which sends neither.
      expect((await publish()).status).toBe(201);
    });

    it("caps new documents per address per day, but not updates", async () => {
      Object.assign(FREE_TOOL_LIMITS.anonymousPublish.perIp, { perHour: 100, perDay: 2 });
      const ip = nextIp();
      const first = await publish({ ip });
      expect(first.status).toBe(201);
      expect((await publish({ ip })).status).toBe(201);

      const blocked = await publish({ ip });
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toContain("today's limit for anonymous publishing");

      const app = await getTestApp();
      const update = await request(app)
        .put(`/api/v1/anonymous/${first.body.id}`)
        .set("X-Forwarded-For", ip)
        .send({ markdown: "# Shared v2", claimToken: first.body.claimToken });
      expect(update.status).toBe(200);
    });

    it("keeps the hourly cap shared by publishes and updates", async () => {
      FREE_TOOL_LIMITS.anonymousPublish.perIp.perHour = 2;
      const ip = nextIp();
      const created = await publish({ ip });
      const app = await getTestApp();
      const update = () =>
        request(app)
          .put(`/api/v1/anonymous/${created.body.id}`)
          .set("X-Forwarded-For", ip)
          .send({ markdown: "# Again", claimToken: created.body.claimToken });
      expect((await update()).status).toBe(200);
      expect((await update()).status).toBe(429);
    });

    it("trips a global circuit breaker with a 503, counting only documents created", async () => {
      FREE_TOOL_LIMITS.anonymousPublish.global.perMinute = 2;
      expect((await publish({ markdown: " " })).status).toBe(400);
      expect((await publish()).status).toBe(201);
      expect((await publish()).status).toBe(201);

      const busy = await publish();
      expect(busy.status).toBe(503);
      expect(busy.body).toMatchObject({
        error: "service_busy",
        message: expect.stringContaining("Anonymous publishing is busy right now"),
      });
      expect(Number(busy.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("has hourly and daily global ceilings", async () => {
      FREE_TOOL_LIMITS.anonymousPublish.global.perDay = 1;
      expect((await publish()).status).toBe(201);
      const busy = await publish();
      expect(busy.status).toBe(503);
      expect(Number(busy.headers["retry-after"])).toBeGreaterThan(3600);
    });

    it("lets production override the global breaker through the environment", async () => {
      process.env.ANONYMOUS_PUBLISH_GLOBAL_PER_DAY = "1";
      expect((await publish()).status).toBe(201);
      const busy = await publish();
      expect(busy.status).toBe(503);
      expect(Number(busy.headers["retry-after"])).toBeGreaterThan(3600);
    });
  });

  describe("reports on anonymous pages", () => {
    beforeEach(() => {
      process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
      process.env.TELEGRAM_OWNER_ID = OWNER;
      process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret";
    });

    const reportMessages = () =>
      telegram.filter((call) => call.method === "sendMessage" && /Anonymous page/.test(String(call.body.text)));

    it("records reports, tells the owner, and hides the page after three different reporters", async () => {
      const created = await publish({ markdown: "# <b>Free</b> crypto\n\nSend your seed phrase." });
      expect(created.status).toBe(201);
      const id = created.body.id as string;
      const { getAnonymousDoc } = await import("@opendocs/shared/anonymous/service");

      const first = await report(id, { ip: "203.0.113.101", body: { reason: "phishing", details: "Asks for <seed> words" } });
      expect(first.status).toBe(202);
      expect(first.body).toMatchObject({ reported: true });
      await vi.waitFor(() => expect(reportMessages()).toHaveLength(1));
      const [message] = reportMessages();
      expect(message.body.chat_id).toBe(OWNER);
      expect(message.body.text).toContain("<b>Anonymous page reported</b>");
      // Author and reporter text is escaped.
      expect(message.body.text).toContain("&lt;b&gt;Free&lt;/b&gt; crypto");
      expect(message.body.text).toContain("Asks for &lt;seed&gt; words");
      expect(message.body.text).toContain("Reason: Phishing or a scam");
      expect(message.body.text).toContain(`/a/${id}`);
      expect(message.body.text).toContain(`/remove ${id}`);

      // The same reporter again changes nothing.
      expect((await report(id, { ip: "203.0.113.101" })).status).toBe(202);
      // An IPv6 neighbour in the same /56 is the same reporter.
      expect((await report(id, { ip: "2001:db8:1:100::1" })).status).toBe(202);
      expect((await report(id, { ip: "2001:db8:1:1ff::9" })).status).toBe(202);
      expect((await getAnonymousDoc(id))?.hidden).toBe(false);

      const { database, schema } = await db();
      const rows = await database
        .select()
        .from(schema.anonymousDocReports)
        .where(eq(schema.anonymousDocReports.anonymousDocId, id));
      expect(rows).toHaveLength(2);
      // Addresses aren't stored, only a keyed hash.
      expect(rows.map((row) => row.reporterHash).join(" ")).not.toContain("203.0.113.101");

      expect((await report(id, { ip: "203.0.113.103", body: { reason: "spam" } })).status).toBe(202);
      await vi.waitFor(() => expect(reportMessages()).toHaveLength(2));
      expect(reportMessages()[1].body.text).toContain("<b>Anonymous page hidden</b> after 3 reports");
      expect(reportMessages()[1].body.text).toContain(`/restore ${id}`);

      const hidden = await getAnonymousDoc(id);
      expect(hidden).toMatchObject({ hidden: true, renderedHtml: "", summary: null });

      // Frozen while hidden: no updates, no claims, no more messages.
      const app = await getTestApp();
      const update = await request(app)
        .put(`/api/v1/anonymous/${id}`)
        .set("X-Forwarded-For", nextIp())
        .send({ markdown: "# Totally fine now", claimToken: created.body.claimToken });
      expect(update.status).toBe(403);
      expect(update.body.error).toBe("hidden");

      const owner = await createOnboardedUser();
      const claim = await request(app)
        .post("/api/v1/anonymous/claim")
        .set(authHeaders(owner.apiKey))
        .send({ claimToken: created.body.claimToken, workspaceId: owner.workspaceId });
      expect(claim.status).toBe(403);
      expect(claim.body.error).toBe("hidden");

      expect((await report(id, { ip: "203.0.113.104" })).status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(reportMessages()).toHaveLength(2);
    });

    it("lets the owner restore or remove a reported page from Telegram", async () => {
      FREE_TOOL_LIMITS.reports.hideAfterDistinctReporters = 1;
      const app = await getTestApp();
      const { getAnonymousDoc } = await import("@opendocs/shared/anonymous/service");
      const command = (text: string) =>
        request(app)
          .post("/api/v1/telegram/webhook")
          .set("X-Telegram-Bot-Api-Secret-Token", "test-webhook-secret")
          .send({
            update_id: 1,
            message: { message_id: 1, text, from: { id: Number(OWNER) }, chat: { id: Number(OWNER), type: "private" } },
          });

      const kept = await publish();
      await report(kept.body.id);
      expect((await getAnonymousDoc(kept.body.id))?.hidden).toBe(true);
      const restored = await command(`/restore ${kept.body.id}`);
      expect(restored.body.text).toBe(`Restored ${kept.body.id}. Its reports are cleared.`);
      expect((await getAnonymousDoc(kept.body.id))?.hidden).toBe(false);

      const removed = await publish();
      await report(removed.body.id);
      expect((await command(`/remove ${removed.body.id}`)).body.text).toBe(`Removed ${removed.body.id}.`);
      expect(await getAnonymousDoc(removed.body.id)).toBeNull();
      expect((await command(`/remove ${removed.body.id}`)).body.text).toContain("No anonymous page");
      expect((await command("/remove")).body.text).toContain("followed by the page id");
    });

    it("hides a page after ANONYMOUS_REPORTS_HIDE_AFTER reporters when it's set", async () => {
      process.env.ANONYMOUS_REPORTS_HIDE_AFTER = "1";
      const { getAnonymousDoc } = await import("@opendocs/shared/anonymous/service");
      const created = await publish();
      expect((await report(created.body.id)).status).toBe(202);
      expect((await getAnonymousDoc(created.body.id))?.hidden).toBe(true);
      await vi.waitFor(() => expect(reportMessages().at(-1)?.body.text).toContain("after 1 reports"));
    });

    it("validates reports and limits how many one address sends", async () => {
      const created = await publish();
      const id = created.body.id as string;

      expect((await report(id, { body: {} })).status).toBe(400);
      expect((await report(id, { body: { reason: "boring" } })).status).toBe(400);
      expect((await report(id, { body: { reason: "spam", details: "x".repeat(501) } })).status).toBe(400);
      expect((await report(id, { body: { reason: "spam", website: "bot" } })).status).toBe(400);
      expect((await report("doesNotExistAtAll000", {})).status).toBe(404);
      expect((await report("bad.id", {})).status).toBe(404);

      FREE_TOOL_LIMITS.reports.perIp.perHour = 2;
      const ip = nextIp();
      expect((await report(id, { ip })).status).toBe(202);
      expect((await report(id, { ip })).status).toBe(202);
      const limited = await report(id, { ip });
      expect(limited.status).toBe(429);
      expect(limited.body.message).toBe("Too many reports from this address. Try again later.");
    });

    it("answers 410 for an expired page", async () => {
      const created = await publish();
      const { database, schema } = await db();
      await database
        .update(schema.anonymousDocs)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(schema.anonymousDocs.id, created.body.id));
      const res = await report(created.body.id);
      expect(res.status).toBe(410);
    });
  });
});
