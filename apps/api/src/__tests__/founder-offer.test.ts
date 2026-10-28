import { createHmac } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

import {
  founderDiscountToRestore,
  getActiveFounderOffer,
  getFounderDiscountId,
  isFounderDiscount,
} from "@opendocs/shared/billing/founder-offer";

import { createOnboardedUser } from "../test-helpers/api";

// Billing config is read when paddle-config loads, so the sandbox bundle
// has to be in place before anything imports it. Fake ids only: nothing
// here talks to Paddle.
const TEST_ENV = vi.hoisted(() => {
  const env = {
    BILLING_MODE: "sandbox",
    PADDLE_SANDBOX_API_KEY: "pdl_sdbx_apikey_founder_test",
    PADDLE_SANDBOX_WEBHOOK_SECRET: "pdl_ntfset_founder_test_secret",
    PADDLE_SANDBOX_PRO_MONTHLY_PRICE_ID: "pri_test_pro_monthly",
    PADDLE_SANDBOX_PRO_YEARLY_PRICE_ID: "pri_test_pro_yearly",
    PADDLE_SANDBOX_TEAM_MONTHLY_PRICE_ID: "pri_test_team_monthly",
    PADDLE_SANDBOX_TEAM_YEARLY_PRICE_ID: "pri_test_team_yearly",
    PADDLE_SANDBOX_PRO_EXTRA_WORKSPACE_MONTHLY_PRICE_ID: "pri_test_extra_monthly",
    PADDLE_SANDBOX_PRO_EXTRA_WORKSPACE_YEARLY_PRICE_ID: "pri_test_extra_yearly",
    PADDLE_SANDBOX_FOUNDER_DISCOUNT_ID: "dsc_test_founder",
    FOUNDER_OFFER_ENDS_AT: "2026-11-30T23:59:59Z",
  };
  Object.assign(process.env, env);
  return env;
});

// The webhook handler lives in the web app, behind Next's server-only guard.
vi.mock("server-only", () => ({}));

const ENDS_AT = new Date("2026-11-30T23:59:59Z");

describe("founder offer", () => {
  const env = {
    PADDLE_SANDBOX_FOUNDER_DISCOUNT_ID: "dsc_sandbox_founder",
    PADDLE_LIVE_FOUNDER_DISCOUNT_ID: "dsc_live_founder",
    FOUNDER_OFFER_ENDS_AT: "2026-11-30T23:59:59Z",
  };

  it("is open before the deadline with the current environment's discount", () => {
    const before = new Date("2026-11-30T23:59:58Z");
    expect(getActiveFounderOffer(before, env, "sandbox")).toEqual({
      discountId: "dsc_sandbox_founder",
      endsAt: ENDS_AT,
    });
    expect(getActiveFounderOffer(before, env, "production")?.discountId).toBe("dsc_live_founder");
  });

  it("waits for the start date when one is set", () => {
    const scheduled = { ...env, FOUNDER_OFFER_STARTS_AT: "2026-11-02T00:00:00Z" };
    expect(getActiveFounderOffer(new Date("2026-11-01T23:59:59Z"), scheduled, "production")).toBeNull();
    expect(getActiveFounderOffer(new Date("2026-11-02T00:00:00Z"), scheduled, "production")?.discountId).toBe(
      "dsc_live_founder",
    );
    // A start date we can't read keeps the offer closed instead of opening it early.
    expect(
      getActiveFounderOffer(new Date("2026-11-10T00:00:00Z"), { ...env, FOUNDER_OFFER_STARTS_AT: "soon" }, "production"),
    ).toBeNull();
  });

  it("closes at the deadline", () => {
    expect(getActiveFounderOffer(ENDS_AT, env, "production")).toBeNull();
    expect(getActiveFounderOffer(new Date("2027-01-01T00:00:00Z"), env, "production")).toBeNull();
  });

  it("is off without billing, a discount id for this environment, or a valid deadline", () => {
    const now = new Date("2026-10-25T00:00:00Z");
    expect(getActiveFounderOffer(now, env, "off")).toBeNull();
    expect(getActiveFounderOffer(now, {}, "production")).toBeNull();
    expect(
      getActiveFounderOffer(now, { ...env, PADDLE_LIVE_FOUNDER_DISCOUNT_ID: " " }, "production"),
    ).toBeNull();
    // Only the sandbox id set: production has no offer.
    expect(
      getActiveFounderOffer(now, { PADDLE_SANDBOX_FOUNDER_DISCOUNT_ID: "dsc_sandbox_founder", FOUNDER_OFFER_ENDS_AT: env.FOUNDER_OFFER_ENDS_AT }, "production"),
    ).toBeNull();
    expect(
      getActiveFounderOffer(now, { ...env, FOUNDER_OFFER_ENDS_AT: undefined }, "production"),
    ).toBeNull();
    expect(
      getActiveFounderOffer(now, { ...env, FOUNDER_OFFER_ENDS_AT: "end of November" }, "production"),
    ).toBeNull();
  });

  it("still recognizes founders after the deadline, by the environment's discount id", () => {
    expect(getFounderDiscountId(env, "production")).toBe("dsc_live_founder");
    expect(isFounderDiscount("dsc_live_founder", env, "production")).toBe(true);
    expect(isFounderDiscount("dsc_sandbox_founder", env, "production")).toBe(false);
    expect(isFounderDiscount("dsc_someone_else", env, "production")).toBe(false);
    expect(isFounderDiscount(null, env, "production")).toBe(false);
    expect(isFounderDiscount("dsc_live_founder", env, "off")).toBe(false);
  });

  it("puts the discount back only for a founding member returning to Pro", () => {
    const restore = (input: Parameters<typeof founderDiscountToRestore>[0]) =>
      founderDiscountToRestore(input, env, "production");

    // Back from Team, where Paddle dropped it.
    expect(restore({ plan: "pro", foundingMember: true, currentDiscountId: null })).toBe(
      "dsc_live_founder",
    );
    // Monthly/yearly switches keep it, so nothing to send.
    expect(
      restore({ plan: "pro", foundingMember: true, currentDiscountId: "dsc_live_founder" }),
    ).toBeNull();
    expect(restore({ plan: "team", foundingMember: true, currentDiscountId: null })).toBeNull();
    expect(restore({ plan: "pro", foundingMember: false, currentDiscountId: null })).toBeNull();
    expect(
      founderDiscountToRestore({ plan: "pro", foundingMember: true, currentDiscountId: null }, {}, "production"),
    ).toBeNull();
  });
});

describe("founder discount from Paddle webhooks", () => {
  type Modules = {
    db: NonNullable<typeof import("@opendocs/shared/db")["db"]>;
    schema: typeof import("@opendocs/shared/db/schema");
    getPaddle: typeof import("@opendocs/shared/billing/paddle-client")["getPaddle"];
    processWebhookEvent: typeof import("../../../web/lib/billing/webhook-handler")["processWebhookEvent"];
  };
  let m: Modules;
  let eventSeq = 0;
  // Paddle sends events in order of occurrence; each delivery is a bit later.
  let clock = Date.parse("2026-10-25T10:00:00Z");

  beforeAll(async () => {
    const [{ db }, schema, { getPaddle }, { processWebhookEvent }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
      import("@opendocs/shared/billing/paddle-client"),
      import("../../../web/lib/billing/webhook-handler"),
    ]);
    if (!db) throw new Error("Database is not initialized.");
    m = { db, schema, getPaddle, processWebhookEvent };
  });

  afterAll(() => {
    for (const key of Object.keys(TEST_ENV)) delete process.env[key];
  });

  function subscriptionData(input: {
    id: string;
    userId: string;
    priceId: string;
    quantity?: number;
    interval?: "month" | "year";
    discountId: string | null;
  }) {
    const at = new Date(clock).toISOString();
    const end = new Date(clock + 30 * 86_400_000).toISOString();
    return {
      id: input.id,
      status: "active",
      customer_id: `ctm_${input.id}`,
      address_id: `add_${input.id}`,
      business_id: null,
      currency_code: "USD",
      created_at: at,
      updated_at: at,
      started_at: at,
      first_billed_at: at,
      next_billed_at: end,
      paused_at: null,
      canceled_at: null,
      discount: input.discountId
        ? { id: input.discountId, starts_at: at, ends_at: null, type: "recurring" }
        : null,
      collection_mode: "automatic",
      billing_details: null,
      current_billing_period: { starts_at: at, ends_at: end },
      billing_cycle: { interval: input.interval ?? "month", frequency: 1 },
      scheduled_change: null,
      items: [
        {
          status: "active",
          quantity: input.quantity ?? 1,
          recurring: true,
          created_at: at,
          updated_at: at,
          previously_billed_at: at,
          next_billed_at: end,
          trial_dates: null,
          price: {
            id: input.priceId,
            product_id: "pro_test_product",
            description: "test price",
            type: "standard",
            billing_cycle: { interval: input.interval ?? "month", frequency: 1 },
            trial_period: null,
            tax_mode: "account_setting",
            unit_price: { amount: "800", currency_code: "USD" },
            unit_price_overrides: [],
            quantity: { minimum: 1, maximum: 100 },
            status: "active",
            custom_data: null,
            import_meta: null,
          },
        },
      ],
      custom_data: { opendocsScope: "user", userId: input.userId },
      import_meta: null,
    };
  }

  /** Signs and unmarshals like the webhook route, then applies the event. */
  async function deliver(eventType: string, data: object) {
    eventSeq += 1;
    clock += 60_000;
    const body = JSON.stringify({
      event_id: `evt_founder_test_${Date.now()}_${eventSeq}`,
      event_type: eventType,
      occurred_at: new Date(clock).toISOString(),
      notification_id: `ntf_founder_test_${Date.now()}_${eventSeq}`,
      data,
    });
    const ts = Math.floor(Date.now() / 1000);
    const h1 = createHmac("sha256", TEST_ENV.PADDLE_SANDBOX_WEBHOOK_SECRET)
      .update(`${ts}:${body}`)
      .digest("hex");
    const event = await m
      .getPaddle()
      .webhooks.unmarshal(body, TEST_ENV.PADDLE_SANDBOX_WEBHOOK_SECRET, `ts=${ts};h1=${h1}`);
    if (!event) throw new Error(`SDK did not parse ${eventType}`);
    await m.db.insert(m.schema.paddleWebhookEvents).values({
      eventId: event.eventId,
      notificationId: event.notificationId ?? event.eventId,
      eventType: event.eventType,
      occurredAt: new Date(event.occurredAt),
      payload: JSON.parse(body),
    });
    await m.processWebhookEvent(event);

    const [stored] = await m.db
      .select({
        processedAt: m.schema.paddleWebhookEvents.processedAt,
        processingError: m.schema.paddleWebhookEvents.processingError,
      })
      .from(m.schema.paddleWebhookEvents)
      .where(eq(m.schema.paddleWebhookEvents.eventId, event.eventId));
    expect(stored?.processingError).toBeNull();
    expect(stored?.processedAt).not.toBeNull();
  }

  async function subscriptionRow(paddleSubscriptionId: string) {
    const [row] = await m.db
      .select({
        plan: m.schema.subscriptions.plan,
        billingCycle: m.schema.subscriptions.billingCycle,
        paddleDiscountId: m.schema.subscriptions.paddleDiscountId,
        foundingMember: m.schema.subscriptions.foundingMember,
        environment: m.schema.subscriptions.environment,
      })
      .from(m.schema.subscriptions)
      .where(eq(m.schema.subscriptions.paddleSubscriptionId, paddleSubscriptionId));
    return row;
  }

  async function userPlan(userId: string) {
    const [row] = await m.db
      .select({ plan: m.schema.user.plan })
      .from(m.schema.user)
      .where(eq(m.schema.user.id, userId));
    return row?.plan;
  }

  it("records a founder checkout and keeps the founding member through Team and back", async () => {
    const owner = await createOnboardedUser();
    const subId = `sub_founder_${Date.now()}`;

    await deliver(
      "subscription.activated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_test_pro_monthly", discountId: "dsc_test_founder" }),
    );
    expect(await subscriptionRow(subId)).toEqual({
      plan: "pro",
      billingCycle: "monthly",
      paddleDiscountId: "dsc_test_founder",
      foundingMember: true,
      environment: "sandbox",
    });
    expect(await userPlan(owner.userId)).toBe("pro");

    // On Team, Paddle drops the discount; the row says so, but the
    // subscription stays a founding member.
    await deliver(
      "subscription.updated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_test_team_monthly", quantity: 3, discountId: null }),
    );
    const onTeam = await subscriptionRow(subId);
    expect(onTeam).toMatchObject({ plan: "team", paddleDiscountId: null, foundingMember: true });
    expect(await userPlan(owner.userId)).toBe("free");
    // Which is what lets the plan change back to Pro put the discount back.
    expect(
      founderDiscountToRestore({
        plan: "pro",
        foundingMember: onTeam!.foundingMember,
        currentDiscountId: onTeam!.paddleDiscountId,
      }),
    ).toBe("dsc_test_founder");

    await deliver(
      "subscription.updated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_test_pro_yearly", interval: "year", discountId: "dsc_test_founder" }),
    );
    expect(await subscriptionRow(subId)).toMatchObject({
      plan: "pro",
      billingCycle: "yearly",
      paddleDiscountId: "dsc_test_founder",
      foundingMember: true,
    });
    expect(await userPlan(owner.userId)).toBe("pro");
  });

  it("records other discounts without making anyone a founding member", async () => {
    const owner = await createOnboardedUser();
    const subId = `sub_regular_${Date.now()}`;

    await deliver(
      "subscription.activated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_test_pro_monthly", discountId: null }),
    );
    expect(await subscriptionRow(subId)).toMatchObject({
      plan: "pro",
      paddleDiscountId: null,
      foundingMember: false,
    });

    await deliver(
      "subscription.updated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_test_pro_monthly", discountId: "dsc_test_someone_else" }),
    );
    expect(await subscriptionRow(subId)).toMatchObject({
      paddleDiscountId: "dsc_test_someone_else",
      foundingMember: false,
    });
  });

  it("tells the owner what a founding member pays, not the list price", async () => {
    const owner = await createOnboardedUser();
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith("https://api.telegram.org/")) return realFetch(input, init);
      sent.push(String(JSON.parse(String(init?.body ?? "{}")).text ?? ""));
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        headers: { "Content-Type": "application/json" },
      });
    });
    process.env.TELEGRAM_BOT_TOKEN = "123:test-token";
    process.env.TELEGRAM_OWNER_ID = "7043577976";
    try {
      const at = new Date(clock).toISOString();
      const money = (amount: string) => ({ amount, currency_code: "USD" });
      await deliver("transaction.completed", {
        id: `txn_founder_${Date.now()}`,
        status: "completed",
        customer_id: "ctm_founder_test",
        address_id: null,
        business_id: null,
        custom_data: { opendocsScope: "user", userId: owner.userId },
        currency_code: "USD",
        origin: "api",
        subscription_id: `sub_founder_txn_${Date.now()}`,
        invoice_id: null,
        invoice_number: null,
        collection_mode: "automatic",
        discount_id: "dsc_test_founder",
        billing_details: null,
        billing_period: null,
        items: [
          {
            price: {
              id: "pri_test_pro_monthly",
              product_id: "pro_test_product",
              description: "Pro - Monthly",
              type: "standard",
              billing_cycle: { interval: "month", frequency: 1 },
              trial_period: null,
              tax_mode: "account_setting",
              unit_price: money("800"),
              unit_price_overrides: [],
              quantity: { minimum: 1, maximum: 1 },
              status: "active",
              custom_data: null,
              import_meta: null,
            },
            quantity: 1,
            proration: null,
          },
        ],
        details: {
          tax_rates_used: [],
          totals: {
            subtotal: "800",
            discount: "400",
            tax: "0",
            total: "400",
            credit: "0",
            credit_to_balance: "0",
            balance: "0",
            grand_total: "400",
            fee: null,
            earnings: null,
            currency_code: "USD",
          },
          adjusted_totals: null,
          payout_totals: null,
          adjusted_payout_totals: null,
          line_items: [],
        },
        payments: [],
        checkout: null,
        created_at: at,
        updated_at: at,
        billed_at: at,
      });
      const message = sent.find((text) => text.includes(owner.email));
      expect(message).toContain("<b>New paying customer</b>");
      expect(message).toContain("Pro, monthly: $4.00");
    } finally {
      fetchSpy.mockRestore();
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_OWNER_ID;
    }
  });

  it("records the discount on status-only updates for a price we no longer map", async () => {
    const owner = await createOnboardedUser();
    const subId = `sub_legacy_${Date.now()}`;

    await deliver(
      "subscription.activated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_test_pro_monthly", discountId: null }),
    );
    await deliver(
      "subscription.updated",
      subscriptionData({ id: subId, userId: owner.userId, priceId: "pri_retired_price", discountId: "dsc_test_founder" }),
    );
    expect(await subscriptionRow(subId)).toMatchObject({
      plan: "pro",
      paddleDiscountId: "dsc_test_founder",
      foundingMember: true,
    });
  });
});
