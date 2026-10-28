import { describe, expect, it } from "vitest";
import request from "supertest";

import { createOnboardedUser, getTestApp } from "../test-helpers/api";

describe("public routes", () => {
  it("serves the health check", async () => {
    const app = await getTestApp();
    const response = await request(app).get("/healthz");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("checks username availability across available, taken, reserved, and invalid inputs", async () => {
    const app = await getTestApp();
    const takenUser = await createOnboardedUser();

    const available = await request(app).get("/api/v1/usernames/check").query({ username: "fresh_name" });
    const taken = await request(app).get("/api/v1/usernames/check").query({ username: takenUser.username });
    const reserved = await request(app).get("/api/v1/usernames/check").query({ username: "docs" });
    const invalid = await request(app).get("/api/v1/usernames/check").query({ username: "Nope!" });

    expect(available.status).toBe(200);
    expect(available.body).toEqual({
      available: true,
      normalized: "fresh_name",
      reason: null,
    });

    expect(taken.status).toBe(200);
    expect(taken.body.available).toBe(false);
    expect(taken.body.normalized).toBe(takenUser.username);
    expect(taken.body.reason).toBeNull();

    expect(reserved.status).toBe(200);
    expect(reserved.body).toEqual({
      available: false,
      normalized: "docs",
      reason: "reserved",
    });

    expect(invalid.status).toBe(200);
    expect(invalid.body).toEqual({
      available: false,
      normalized: "nope!",
      reason: "invalid",
    });
  });
});
