import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import { allFeaturesUnlocked } from "@opendocs/shared/billing/comped-tiers";
import {
  instanceApiUrl,
  instanceHost,
  instanceMcpUrl,
  instanceWebUrl,
  isOpenDocsCc,
  isSelfHosted,
  withInstanceUrls,
} from "@opendocs/shared/config/instance";
import { customDomainCnameTarget } from "@opendocs/shared/custom-domains/hostname";
import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A self-hosted instance at example.com, as deploy/.env describes it. */
function selfHostedAtExampleCom() {
  vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://example.com");
  vi.stubEnv("API_URL", "https://api.example.com");
  vi.stubEnv("MCP_RESOURCE_URL", "https://mcp.example.com/mcp");
  vi.stubEnv("SELF_HOSTED", "true");
  vi.stubEnv("BILLING_MODE", "off");
}

describe("the instance's addresses", () => {
  it("are opendocs.cc's unless the instance sets its own", () => {
    vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://opendocs.cc/");
    vi.stubEnv("API_URL", "");
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    vi.stubEnv("MCP_RESOURCE_URL", "");
    expect(instanceWebUrl()).toBe("https://opendocs.cc");
    expect(instanceApiUrl()).toBe("https://api.opendocs.cc");
    expect(instanceMcpUrl()).toBe("https://mcp.opendocs.cc/mcp");
    expect(isOpenDocsCc()).toBe(true);
    expect(withInstanceUrls("curl -fsSL https://opendocs.cc/install.sh | bash")).toBe(
      "curl -fsSL https://opendocs.cc/install.sh | bash",
    );

    selfHostedAtExampleCom();
    expect(instanceWebUrl()).toBe("https://example.com");
    expect(instanceHost()).toBe("example.com");
    expect(isOpenDocsCc()).toBe(false);
    expect(isSelfHosted()).toBe(true);
  });

  it("rewrite agent files and setup prompts, keeping the docs on docs.opendocs.cc", () => {
    selfHostedAtExampleCom();
    const text = [
      "web: https://opendocs.cc",
      "api_base: https://api.opendocs.cc",
      "mcp: https://mcp.opendocs.cc/mcp, metadata at https://mcp.opendocs.cc/.well-known/oauth-protected-resource/mcp",
      "docs: https://docs.opendocs.cc/getting-started/agent-quickstart.md",
      "curl -fsSL https://opendocs.cc/install.sh | bash",
      "run opendocs login --email <email> --json",
      "npx @opendocs.cc/cli login --browser",
      "opendocs login --api-url https://api.elsewhere.com",
    ].join("\n");
    expect(withInstanceUrls(text).split("\n")).toEqual([
      "web: https://example.com",
      "api_base: https://api.example.com",
      "mcp: https://mcp.example.com/mcp, metadata at https://mcp.example.com/.well-known/oauth-protected-resource/mcp",
      "docs: https://docs.opendocs.cc/getting-started/agent-quickstart.md",
      "curl -fsSL https://example.com/install.sh | bash",
      "run opendocs login --api-url https://api.example.com --email <email> --json",
      "npx @opendocs.cc/cli login --api-url https://api.example.com --browser",
      "opendocs login --api-url https://api.elsewhere.com",
    ]);
  });

  it("give custom domains a CNAME target on the instance's own domain", () => {
    vi.stubEnv("CUSTOM_DOMAIN_CNAME_TARGET", "");
    expect(customDomainCnameTarget()).toBe("custom.opendocs.cc");
    selfHostedAtExampleCom();
    expect(customDomainCnameTarget()).toBe("custom.example.com");
  });
});

describe("SELF_HOSTED=true", () => {
  it("unlocks every feature while billing is off, unless UNLOCK_ALL_FEATURES=false", () => {
    selfHostedAtExampleCom();
    expect(allFeaturesUnlocked()).toBe(true);
    vi.stubEnv("UNLOCK_ALL_FEATURES", "false");
    expect(allFeaturesUnlocked()).toBe(false);
    vi.stubEnv("UNLOCK_ALL_FEATURES", "");
    vi.stubEnv("BILLING_MODE", "production");
    expect(allFeaturesUnlocked()).toBe(false);
  });

  it("turns off anonymous publishing and the free tools", async () => {
    const app = await getTestApp();
    selfHostedAtExampleCom();

    const anonymous = await request(app)
      .post("/api/v1/anonymous/publish")
      .send({ markdown: "# Hello", title: "Hello" });
    expect(anonymous.status).toBe(404);
    expect(anonymous.body).toMatchObject({ error: "not_available" });

    const convert = await request(app)
      .post("/api/v1/tools/convert/pdf")
      .attach("file", Buffer.from("# Hello"), "hello.md");
    expect(convert.status).toBe(404);
    expect(convert.body).toMatchObject({ error: "not_available" });

    vi.unstubAllEnvs();
    const back = await request(app).post("/api/v1/anonymous/publish").send({ markdown: "# Hello", title: "Hello" });
    expect(back.status).not.toBe(404);
  });

  it("links published documents to the instance and lifts the Free limits", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    selfHostedAtExampleCom();

    const published = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId, markdown: "# Plan\n\nWe ship in May." });
    expect(published.status).toBe(201);
    expect(published.body.publicUrl).toMatch(/^https:\/\/example\.com\//);

    const second = await request(app)
      .post("/api/v1/workspaces")
      .set(authHeaders(owner.apiKey))
      .send({ name: `Second ${Date.now()}` });
    expect(second.status).toBe(201);
  });
});
