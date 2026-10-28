import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createSessionAgent, getTestApp } from "../test-helpers/api";

const OWNER = "7043577976";
const SECRET = "test-webhook-secret";

type TelegramCall = { method: string; body: Record<string, unknown> };

describe("owner notifications on Telegram", () => {
  const calls: TelegramCall[] = [];
  const realFetch = globalThis.fetch;

  beforeAll(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://api.telegram.org/")) return realFetch(input, init);
      calls.push({
        method: url.split("/").pop() ?? "",
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    calls.length = 0;
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    process.env.TELEGRAM_OWNER_ID = OWNER;
    process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_OWNER_ID;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
  });

  const messagesAbout = (email: string) =>
    calls.filter((c) => c.method === "sendMessage" && String(c.body.text).includes(email));

  it("tells the owner about a new signup, and only the owner", async () => {
    const { email } = await createSessionAgent({ name: "<b>Dana</b> Whitfield" });

    await vi.waitFor(() => expect(messagesAbout(email)).toHaveLength(1));
    const [message] = messagesAbout(email);
    expect(message.body.chat_id).toBe(OWNER);
    expect(message.body.parse_mode).toBe("HTML");
    expect(message.body.text).toContain("<b>New signup</b>");
    // The name is escaped, so a signup can't inject markup into the message.
    expect(message.body.text).toContain("&lt;b&gt;Dana&lt;/b&gt; Whitfield");
    expect(message.body.text).toContain("Signed up with email and password");
    expect(message.body.text).toMatch(/\d+ accounts in total/);
  });

  it("says when an agent signed someone up with an emailed code", async () => {
    const app = await getTestApp();
    const email = `code-${Date.now()}@agents.example.com`;
    await request(app).post("/api/v1/auth/code/request").send({ email });
    const { devOutbox } = await import("@opendocs/shared/email");
    const code = [...devOutbox]
      .reverse()
      .find((item) => item.to === email)
      ?.subject.match(/^(\d{6}) is your OpenDocs sign-in code$/)?.[1];
    const verified = await request(app).post("/api/v1/auth/code/verify").send({ email, code });
    expect(verified.status).toBe(200);

    await vi.waitFor(() => expect(messagesAbout(email)).toHaveLength(1));
    expect(messagesAbout(email)[0].body.text).toContain("Signed up with an emailed code");
  });

  it("sends nothing when the bot isn't configured", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    const { email } = await createSessionAgent();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(messagesAbout(email)).toHaveLength(0);
  });

  it("tells the owner about a new paying customer", async () => {
    const { notifyNewSubscriber } = await import("@opendocs/shared/notifications/telegram");
    await notifyNewSubscriber({
      email: "sam@halvard.example",
      plan: "team",
      cycle: "monthly",
      seats: 5,
      amount: 20,
      currency: "USD",
    });
    const [message] = messagesAbout("sam@halvard.example");
    expect(message.body.chat_id).toBe(OWNER);
    expect(message.body.text).toContain("<b>New paying customer</b>");
    expect(message.body.text).toContain("Team, monthly, 5 seats: $20.00");
  });

  describe("webhook", () => {
    const update = (from: number | string, text: string, chat: { id?: number | string; type?: string } = {}) => ({
      update_id: 1,
      message: {
        message_id: 1,
        text,
        from: { id: Number(from), is_bot: false, first_name: "Someone" },
        chat: { id: Number(chat.id ?? from), type: chat.type ?? "private" },
      },
    });
    const post = async (body: unknown, secret: string | null = SECRET) => {
      const app = await getTestApp();
      const req = request(app).post("/api/v1/telegram/webhook");
      if (secret) req.set("X-Telegram-Bot-Api-Secret-Token", secret);
      return req.send(body as object);
    };

    it("is off without the Telegram settings", async () => {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      expect((await post(update(OWNER, "/stats"))).status).toBe(404);
    });

    it("rejects requests without Telegram's secret token", async () => {
      expect((await post(update(OWNER, "/stats"), null)).status).toBe(401);
      expect((await post(update(OWNER, "/stats"), "wrong-secret")).status).toBe(401);
    });

    it("ignores everyone but the owner, without answering", async () => {
      const stranger = await post(update(111111, "/stats"));
      expect(stranger.status).toBe(200);
      expect(stranger.text).toBe("OK");

      // The owner writing in a group the bot was added to is ignored too.
      const group = await post(update(OWNER, "/stats", { id: -100123, type: "group" }));
      expect(group.status).toBe(200);
      expect(group.text).toBe("OK");
      expect(calls).toHaveLength(0);
    });

    it("answers the owner's /stats with signups and paying customers", async () => {
      const res = await post(update(OWNER, "/stats"));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ method: "sendMessage", chat_id: OWNER, parse_mode: "HTML" });
      expect(res.body.text).toContain("<b>Accounts</b>");
      expect(res.body.text).toMatch(/\d+ today, \d+ in 7 days, \d+ in 30 days/);
      expect(res.body.text).toContain("<b>Paying subscriptions</b>");
    });

    it("answers anything else from the owner with the help text", async () => {
      const res = await post(update(OWNER, "/start"));
      expect(res.body.text).toContain("/stats");
    });
  });
});
