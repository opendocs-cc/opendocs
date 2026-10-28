import { NextResponse, type NextRequest } from "next/server";

import { db } from "@opendocs/shared/db";
import { paddleWebhookEvents } from "@opendocs/shared/db/schema";

import { getBillingConfig } from "@/lib/billing/config";
import { getPaddle } from "@/lib/billing/paddle";
import { processWebhookEvent } from "@/lib/billing/webhook-handler";

/**
 * Paddle webhook endpoint.
 *
 * Contract with Paddle:
 *   - Respond with 2xx within 5 seconds or Paddle considers the delivery
 *     failed and retries (up to 3 days, exponential backoff).
 *   - Verify the `Paddle-Signature` header before trusting anything.
 *     Missing or bad signature → 401; Paddle stops retrying on 4xx.
 *   - Raw request body is REQUIRED for HMAC verification. Any re-parse /
 *     JSON.stringify would change byte-for-byte equality and the signature
 *     check would fail. We read `req.text()` once and never re-serialize.
 *
 * Processing pipeline:
 *   1. Verify signature with paddle.webhooks.unmarshal() — throws on bad.
 *   2. Insert the event row with ON CONFLICT (event_id) DO NOTHING. That
 *      makes delivery retries (same event_id, different notification_id)
 *      idempotent: the second insert is a no-op.
 *   3. Apply the event to domain state. On permanent errors we log and
 *      return 200 (so Paddle stops retrying); on transient errors we
 *      return 500 (so Paddle retries).
 *
 * Important Next.js footgun: this route MUST run on the Node runtime —
 * the Paddle SDK's webhook verification uses the Node `crypto` module.
 * Edge runtime would silently fail with "crypto is not defined".
 */

// Next.js route-segment config.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getSignatureHeader(req: NextRequest): string | null {
  // Header names are case-insensitive; Paddle sends "Paddle-Signature"
  // but middlewares sometimes lowercase it. Check both.
  return (
    req.headers.get("paddle-signature") ??
    req.headers.get("Paddle-Signature") ??
    null
  );
}

export async function POST(req: NextRequest) {
  if (!db) {
    // Database unreachable — can't even log the event. Return 500 so
    // Paddle retries; we'll catch up when the DB is back.
    return NextResponse.json(
      { error: "database_unavailable" },
      { status: 500 },
    );
  }

  const config = getBillingConfig();
  if (!config) {
    // Billing disabled. This should almost never happen in practice —
    // if the destination exists in Paddle's dashboard, billing should be
    // on. Return 410 Gone so Paddle abandons the delivery without retry.
    return NextResponse.json({ error: "billing_disabled" }, { status: 410 });
  }

  const signature = getSignatureHeader(req);
  if (!signature) {
    return NextResponse.json(
      { error: "missing_signature" },
      { status: 401 },
    );
  }

  // Read the raw body. Do NOT use req.json() — that re-parses and we
  // lose byte equivalence for HMAC.
  const rawBody = await req.text();

  let event;
  try {
    event = await getPaddle().webhooks.unmarshal(
      rawBody,
      config.webhookSecret,
      signature,
    );
  } catch (error) {
    // Bad signature, malformed body, or unknown event type. 401 is safe
    // for all three — Paddle stops retrying on 4xx, which is what we
    // want for a body that can never verify.
    // eslint-disable-next-line no-console
    console.warn("[paddle-webhook] signature verification failed:", error);
    return NextResponse.json(
      { error: "invalid_signature" },
      { status: 401 },
    );
  }

  if (!event) {
    // Unmarshal returned null (unknown event type Paddle's SDK can't
    // hydrate). Ack and move on — retrying won't help.
    return NextResponse.json({ ok: true, ignored: true });
  }

  // Idempotent insert. Notification headers also carry a
  // "paddle-id" / "paddle-notification-id" — we use the event_id
  // (inside the payload) as the primary key since that's the stable
  // identifier across retries.
  const notificationId =
    req.headers.get("paddle-id") ??
    req.headers.get("paddle-notification-id") ??
    event.notificationId ??
    event.eventId;

  try {
    await db
      .insert(paddleWebhookEvents)
      .values({
        eventId: event.eventId,
        notificationId,
        eventType: event.eventType,
        occurredAt: new Date(event.occurredAt),
        payload: JSON.parse(rawBody),
      })
      .onConflictDoNothing({ target: paddleWebhookEvents.eventId });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      `[paddle-webhook] failed to persist event ${event.eventId}:`,
      error,
    );
    return NextResponse.json(
      { error: "persist_failed" },
      { status: 500 },
    );
  }

  try {
    await processWebhookEvent(event);
  } catch (error) {
    // Transient failure — log and return 500 so Paddle retries.
    // eslint-disable-next-line no-console
    console.error(
      `[paddle-webhook] processing failed for ${event.eventId}:`,
      error,
    );
    return NextResponse.json(
      { error: "processing_failed" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

// GET handler for smoke tests ("is this endpoint reachable?"). Paddle
// only uses POST; this is purely for us to curl during setup.
export async function GET() {
  return NextResponse.json({
    ok: true,
    billing: getBillingConfig()?.mode ?? "off",
  });
}
