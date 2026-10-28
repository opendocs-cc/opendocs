import { afterAll, beforeAll, describe, expect, it } from "vitest";
import request from "supertest";

import { getTestApp } from "../test-helpers/api";

// Limiters are skipped in tests by default; this suite opts in. Each test
// uses its own client IPs so buckets don't bleed between tests.
describe("rate limiting", () => {
  beforeAll(() => {
    process.env.OPENDOCS_TEST_RATE_LIMITS = "true";
  });

  afterAll(() => {
    delete process.env.OPENDOCS_TEST_RATE_LIMITS;
  });

  it("keys limits on the client IP forwarded by the proxy, not the proxy itself", async () => {
    const app = await getTestApp();

    const first = await request(app).get("/healthz").set("X-Forwarded-For", "203.0.113.10");
    const second = await request(app).get("/healthz").set("X-Forwarded-For", "203.0.113.10");
    const otherClient = await request(app).get("/healthz").set("X-Forwarded-For", "203.0.113.11");

    expect(first.headers["ratelimit-limit"]).toBe("600");
    expect(first.headers["ratelimit-remaining"]).toBe("599");
    expect(second.headers["ratelimit-remaining"]).toBe("598");
    // A different client behind the same proxy gets its own bucket.
    expect(otherClient.headers["ratelimit-remaining"]).toBe("599");
  });

  it("applies the stricter auth limit to auth POSTs and returns 429 once exhausted", async () => {
    const app = await getTestApp();
    const signIn = () =>
      request(app)
        .post("/api/auth/sign-in/email")
        .set("X-Forwarded-For", "203.0.113.20")
        .send({});

    const first = await signIn();
    expect(first.headers["ratelimit-limit"]).toBe("100");
    expect(first.headers["ratelimit-remaining"]).toBe("99");

    for (let i = 1; i < 100; i += 1) {
      await signIn();
    }

    const blocked = await signIn();
    expect(blocked.status).toBe(429);
    expect(blocked.body).toMatchObject({
      error: "rate_limited",
      message: "Too many requests. Try again later.",
    });

    // Other clients are unaffected.
    const otherClient = await request(app)
      .post("/api/auth/sign-in/email")
      .set("X-Forwarded-For", "203.0.113.21")
      .send({});
    expect(otherClient.status).not.toBe(429);
  });
  // One subscriber usually gets a whole /64 (or /56) and can rotate through
  // it, so every per-address limit buckets IPv6 by /56.
  describe("IPv6 clients", () => {
    const sameSlash56 = ["2001:db8:abcd:1200::1", "2001:db8:abcd:12ff:ffff:ffff:ffff:fffe"];
    const otherSlash56 = "2001:db8:abcd:1300::1";

    it("share one sign-in code request bucket across a /56", async () => {
      const app = await getTestApp();
      const requestCode = (ip: string) =>
        request(app).post("/api/v1/auth/code/request").set("X-Forwarded-For", ip).send({});

      const first = await requestCode(sameSlash56[0]);
      expect(first.headers["ratelimit-limit"]).toBe("5");
      expect(first.headers["ratelimit-remaining"]).toBe("4");
      const second = await requestCode(sameSlash56[1]);
      expect(second.headers["ratelimit-remaining"]).toBe("3");

      // Rotating addresses inside the /56 doesn't buy more requests.
      for (const ip of ["2001:db8:abcd:120a::2", "2001:db8:abcd:1250:1::3", "2001:db8:abcd:12c0::4"]) {
        expect((await requestCode(ip)).status).not.toBe(429);
      }
      const blocked = await requestCode("2001:db8:abcd:1234:5678::9");
      expect(blocked.status).toBe(429);
      expect(blocked.body.message).toMatch(/sign-in code requests/);

      // The neighbouring /56 is someone else.
      const neighbour = await requestCode(otherSlash56);
      expect(neighbour.status).not.toBe(429);
      expect(neighbour.headers["ratelimit-remaining"]).toBe("4");
    });

    it("share one sign-in code verify bucket across a /56", async () => {
      const app = await getTestApp();
      const verify = (ip: string) =>
        request(app).post("/api/v1/auth/code/verify").set("X-Forwarded-For", ip).send({});

      expect((await verify("2001:db8:aaaa:bb00::1")).headers["ratelimit-remaining"]).toBe("19");
      expect((await verify("2001:db8:aaaa:bbff::2")).headers["ratelimit-remaining"]).toBe("18");
      expect((await verify("2001:db8:aaaa:bc00::1")).headers["ratelimit-remaining"]).toBe("19");
    });

    it("share one auth bucket across a /56", async () => {
      const app = await getTestApp();
      const signIn = (ip: string) =>
        request(app).post("/api/auth/sign-in/email").set("X-Forwarded-For", ip).send({});

      expect((await signIn("2001:db8:cccc:dd00::1")).headers["ratelimit-remaining"]).toBe("99");
      expect((await signIn("2001:db8:cccc:ddff::1")).headers["ratelimit-remaining"]).toBe("98");
      expect((await signIn("2001:db8:cccc:de00::1")).headers["ratelimit-remaining"]).toBe("99");
    });

    it("share one bucket across a /56 for signed-out callers of reader and account limits", async () => {
      const app = await getTestApp();
      // readerOrIpKey: a public document's raw Markdown.
      const raw = (ip: string) =>
        request(app).get("/api/v1/public/posts/nobody/nothing/raw").set("X-Forwarded-For", ip);
      expect((await raw("2001:db8:eeee:ff00::1")).headers["ratelimit-remaining"]).toBe("119");
      expect((await raw("2001:db8:eeee:ff12::1")).headers["ratelimit-remaining"]).toBe("118");

      // downloads: link redemption, before the link (and its owner) is known.
      const download = (ip: string) =>
        request(app).get("/api/v1/downloads/dl_doesnotexist").set("X-Forwarded-For", ip);
      expect((await download("2001:db8:eeee:ff00::1")).headers["ratelimit-remaining"]).toBe("29");
      expect((await download("2001:db8:eeee:ff34::1")).headers["ratelimit-remaining"]).toBe("28");
    });
  });
});
