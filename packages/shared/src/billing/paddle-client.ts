import { Environment, Paddle } from "@paddle/paddle-node-sdk";

import { requireServerBillingConfig } from "./paddle-config";

/**
 * Memoized Paddle SDK client shared by server processes.
 */
let cached: { key: string; paddle: Paddle } | null = null;

export function getPaddle(): Paddle {
  const config = requireServerBillingConfig();

  if (cached && cached.key === config.apiKey) {
    return cached.paddle;
  }

  const paddle = new Paddle(config.apiKey, {
    environment:
      config.environment === "sandbox"
        ? Environment.sandbox
        : Environment.production,
  });

  cached = { key: config.apiKey, paddle };
  return paddle;
}
