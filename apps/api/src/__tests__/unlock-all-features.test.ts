import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { allFeaturesUnlocked, compedTierToPlanTier, normalizeCompedTier } from "@opendocs/shared/billing/comped-tiers";
import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("UNLOCK_ALL_FEATURES", () => {
  it("gives everyone creator access while billing is off", () => {
    vi.stubEnv("BILLING_MODE", "off");
    expect(allFeaturesUnlocked()).toBe(false);
    expect(normalizeCompedTier(null)).toBeNull();

    vi.stubEnv("UNLOCK_ALL_FEATURES", "true");
    expect(allFeaturesUnlocked()).toBe(true);
    expect(normalizeCompedTier(null)).toBe("creator");
    expect(normalizeCompedTier("friends")).toBe("creator");
    expect(compedTierToPlanTier(null)).toBe("team");
  });

  it("is ignored while billing is on", () => {
    vi.stubEnv("UNLOCK_ALL_FEATURES", "true");
    for (const mode of ["sandbox", "production"]) {
      vi.stubEnv("BILLING_MODE", mode);
      expect(allFeaturesUnlocked()).toBe(false);
      expect(normalizeCompedTier(null)).toBeNull();
      expect(normalizeCompedTier("friends")).toBe("friends");
    }
  });

  it("lifts the Free limits for a new account, and they return when it's off", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    const createWorkspace = (name: string) =>
      request(app).post("/api/v1/workspaces").set(authHeaders(owner.apiKey)).send({ name });

    const atLimit = await createWorkspace(`Locked ${Date.now()}`);
    expect(atLimit.status).toBe(403);
    expect(atLimit.body).toMatchObject({ error: "plan_limit" });

    vi.stubEnv("BILLING_MODE", "off");
    vi.stubEnv("UNLOCK_ALL_FEATURES", "true");
    const unlocked = await createWorkspace(`Unlocked ${Date.now()}`);
    expect(unlocked.status).toBe(201);

    vi.unstubAllEnvs();
    const lockedAgain = await createWorkspace(`Locked again ${Date.now()}`);
    expect(lockedAgain.status).toBe(403);
  });
});
