import {
  initializePaddle,
  type Environments,
  type Paddle,
  type PaddleEventData,
} from "@paddle/paddle-js";

/**
 * Client-side Paddle.js helper.
 *
 * Paddle.js must be initialized once per page load before `Checkout.open`
 * can be called. We lazily initialize on the first `openCheckout()` call
 * and cache the instance, keyed on the client token — if `BILLING_MODE`
 * flips between sandbox and production at runtime (it doesn't today, but
 * if the server re-renders with a new token we want to pick it up) the
 * cache is invalidated.
 *
 * Called only from "use client" components — don't import this from a
 * Server Component, it will execute at import time on the server and
 * throw when it tries to fetch `cdn.paddle.com`.
 */

export type CheckoutEnvironment = Environments;

export interface OpenCheckoutInput {
  /** From startCheckoutAction. Carries the items and any discount (the
   *  founder offer is attached there), so the overlay shows the real
   *  total; nothing price-related is passed from the browser. */
  transactionId: string;
  clientToken: string;
  environment: CheckoutEnvironment;
  /** Pre-filled in the checkout form. */
  customerEmail?: string;
  /** Called when the checkout completes successfully. Use this to
   *  refresh the page / show a success toast. The subscription state
   *  will NOT yet be in our DB at this point — the webhook usually
   *  arrives within a few seconds. */
  onComplete?: () => void;
  /** Called when the user closes the overlay without completing. */
  onClose?: () => void;
}

let cachedInstance: { token: string; paddle: Paddle } | null = null;

async function getOrInitPaddle(
  token: string,
  environment: CheckoutEnvironment,
  eventCallback: (event: PaddleEventData) => void,
): Promise<Paddle> {
  if (cachedInstance && cachedInstance.token === token) {
    return cachedInstance.paddle;
  }

  const paddle = await initializePaddle({
    token,
    environment,
    eventCallback,
    checkout: {
      settings: {
        displayMode: "overlay",
        theme: "light",
        variant: "one-page",
        // Keep the user on our success page. Paddle reloads this URL
        // once the transaction is complete, giving the webhook a few
        // extra seconds to land.
        successUrl: `${window.location.origin}/dashboard/billing?success=1`,
      },
    },
  });

  if (!paddle) {
    throw new Error("Failed to initialize Paddle.js");
  }

  cachedInstance = { token, paddle };
  return paddle;
}

export async function openCheckout(input: OpenCheckoutInput): Promise<void> {
  const paddle = await getOrInitPaddle(
    input.clientToken,
    input.environment,
    (event) => {
      if (event.name === "checkout.completed") {
        input.onComplete?.();
      } else if (event.name === "checkout.closed") {
        input.onClose?.();
      }
    },
  );

  paddle.Checkout.open({
    transactionId: input.transactionId,
    ...(input.customerEmail ? { customer: { email: input.customerEmail } } : {}),
  });
}
