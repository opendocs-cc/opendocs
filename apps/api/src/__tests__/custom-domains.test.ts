import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { and, desc, eq } from "drizzle-orm";

import { db as database } from "@opendocs/shared/db";
import * as schema from "@opendocs/shared/db/schema";
import { devOutbox } from "@opendocs/shared/email";
import {
  createBridgeCode,
  exchangeBridgeCode,
  getViewerSession,
  isActiveWorkspaceMember,
  newBridgeSecret,
  signOutEverywhere,
  revokeViewerSession,
} from "@opendocs/shared/custom-domains/bridge";
import type { DnsResolver } from "@opendocs/shared/custom-domains/dns";
import { hasDocumentsSharedInWorkspace } from "@opendocs/shared/posts/sharing";
import {
  hostnameKind,
  isOpenDocsHost,
  normalizeHostHeader,
  validateCustomHostname,
} from "@opendocs/shared/custom-domains/hostname";
import {
  CUSTOM_DOMAIN_FAILURE_LIMIT,
  clearCustomDomainCaches,
  getServingCustomDomain,
  getServingCustomDomainForSlug,
  setCustomDomainForUser,
  lookupCustomHost,
  recheckDueCustomDomains,
  runCustomDomainCheck,
  setCustomDomainResolver,
} from "@opendocs/shared/custom-domains/service";
import {
  customDomainUrl,
  isServedOnCustomDomain,
  openDocsWebUrl,
  safeReturnPath,
  stripWorkspacePrefix,
  workspaceRoutePath,
} from "@opendocs/shared/custom-domains/urls";

import { createInternalApp } from "../internal";
import { authHeaders, createOnboardedUser, getTestApp } from "../test-helpers/api";

// ---- Helpers -------------------------------------------------------------------

function db() {
  if (!database) throw new Error("Database is not initialized.");
  return database;
}

const TARGET = "custom.opendocs.cc";
let hostCounter = 0;
function uniqueHost(prefix = "notes") {
  hostCounter += 1;
  return `${prefix}${hostCounter}-${Date.now().toString(36)}.acmecorp.io`;
}

type FakeDns = {
  txt?: Record<string, string[]>;
  cname?: Record<string, string>;
  a?: Record<string, string[]>;
  aaaa?: Record<string, string[]>;
  /** Names whose lookups fail with SERVFAIL (inconclusive). */
  broken?: string[];
};

let dns: FakeDns = {};

function lookup<T>(table: Record<string, T> | undefined, name: string): T {
  if (dns.broken?.includes(name)) {
    throw Object.assign(new Error(`queryA ESERVFAIL ${name}`), { code: "ESERVFAIL" });
  }
  const value = table?.[name];
  if (value === undefined) throw Object.assign(new Error(`ENOTFOUND ${name}`), { code: "ENOTFOUND" });
  return value;
}

const fakeResolver: DnsResolver = {
  resolveTxt: async (name) => lookup(dns.txt, name).map((value) => [value]),
  resolveCname: async (name) => [lookup(dns.cname, name)],
  resolve4: async (name) => {
    // A CNAME to our target resolves to our address, like real DNS.
    if (dns.cname?.[name] === TARGET && !dns.a?.[name]) return ["203.0.113.10"];
    return lookup(dns.a, name);
  },
  resolve6: async (name) => lookup(dns.aaaa, name),
};

/** Publishes the records the domain's settings card asks for. */
function publishRecords(hostname: string, txtValue: string, routing: { cname?: string; a?: string[] } = { cname: TARGET }) {
  dns.txt = { ...dns.txt, [`_opendocs.${hostname}`]: [txtValue] };
  if (routing.cname) dns.cname = { ...dns.cname, [hostname]: routing.cname };
  if (routing.a) dns.a = { ...dns.a, [hostname]: routing.a };
}

function removeRecords(hostname: string) {
  const { [`_opendocs.${hostname}`]: _txt, ...txt } = dns.txt ?? {};
  const { [hostname]: _cname, ...cname } = dns.cname ?? {};
  const { [hostname]: _a, ...a } = dns.a ?? {};
  dns = { ...dns, txt, cname, a };
}

async function setUserPlan(userId: string, plan: "free" | "pro") {
  await db().update(schema.user).set({ plan }).where(eq(schema.user.id, userId));
}

async function setCompedTier(userId: string, compedTier: string | null) {
  await db().update(schema.user).set({ compedTier }).where(eq(schema.user.id, userId));
}

async function setWorkspacePlan(workspaceId: string, plan: "free" | "team") {
  await db().update(schema.workspaces).set({ plan }).where(eq(schema.workspaces.id, workspaceId));
}

async function allowPublicDocuments(workspaceId: string) {
  await db()
    .update(schema.workspaces)
    .set({ allowPublicDocuments: true })
    .where(eq(schema.workspaces.id, workspaceId));
}

async function domainRow(workspaceId: string) {
  const [row] = await db()
    .select()
    .from(schema.workspaceCustomDomains)
    .where(eq(schema.workspaceCustomDomains.workspaceId, workspaceId))
    .limit(1);
  return row;
}

async function latestSessionId(userId: string) {
  const [row] = await db()
    .select({ id: schema.session.id })
    .from(schema.session)
    .where(eq(schema.session.userId, userId))
    .orderBy(desc(schema.session.createdAt))
    .limit(1);
  if (!row) throw new Error("No session for user.");
  return row.id;
}

type Owner = Awaited<ReturnType<typeof createOnboardedUser>>;

async function putDomain(owner: Owner, hostname: string) {
  const app = await getTestApp();
  return request(app)
    .put("/api/v1/workspace/domain")
    .set(authHeaders(owner.apiKey))
    .send({ workspaceId: owner.workspaceId, hostname });
}

/** A Pro owner with a public workspace whose domain is active. */
async function ownerWithActiveDomain(hostname = uniqueHost()) {
  const owner = await createOnboardedUser();
  await setUserPlan(owner.userId, "pro");
  await allowPublicDocuments(owner.workspaceId);
  const saved = await putDomain(owner, hostname);
  expect(saved.status).toBe(200);
  const txt = saved.body.domain.records.find((record: { type: string }) => record.type === "TXT");
  publishRecords(hostname, txt.value);
  const app = await getTestApp();
  const checked = await request(app)
    .post("/api/v1/workspace/domain/check")
    .set(authHeaders(owner.apiKey))
    .send({ workspaceId: owner.workspaceId });
  expect(checked.status).toBe(200);
  expect(checked.body.domain.status).toBe("active");
  clearCustomDomainCaches();
  return { owner, hostname, txtValue: txt.value as string };
}

async function publish(owner: Owner, body: Record<string, unknown>) {
  const app = await getTestApp();
  return request(app)
    .post("/api/v1/publish")
    .set(authHeaders(owner.apiKey))
    .send({ workspaceId: owner.workspaceId, markdown: "# Plan\n\nWe ship in May.", ...body });
}

beforeAll(() => {
  setCustomDomainResolver(fakeResolver);
});

beforeEach(() => {
  dns = {};
  clearCustomDomainCaches();
});

afterEach(() => {
  delete process.env.CUSTOM_DOMAIN_IPV4;
});

afterAll(() => {
  setCustomDomainResolver(null);
});

// ---- Hostnames and URLs ----------------------------------------------------------

describe("custom domain hostnames", () => {
  it("normalizes case, a pasted URL, a trailing dot and non-ASCII names to punycode", () => {
    expect(validateCustomHostname("Notes.AcmeCorp.IO.")).toEqual({
      ok: true,
      hostname: "notes.acmecorp.io",
      kind: "subdomain",
    });
    expect(validateCustomHostname("https://notes.acmecorp.io/")).toMatchObject({
      ok: true,
      hostname: "notes.acmecorp.io",
    });
    expect(validateCustomHostname("skjöl.example.is")).toEqual({
      ok: true,
      hostname: "xn--skjl-7qa.example.is",
      kind: "subdomain",
    });
    expect(validateCustomHostname("bücher.de")).toMatchObject({ ok: true, hostname: "xn--bcher-kva.de", kind: "apex" });
  });

  it("tells apex domains from subdomains, including two-label public suffixes", () => {
    expect(hostnameKind("example.is")).toBe("apex");
    expect(hostnameKind("notes.example.is")).toBe("subdomain");
    expect(hostnameKind("acme.co.uk")).toBe("apex");
    expect(hostnameKind("docs.acme.co.uk")).toBe("subdomain");
    expect(hostnameKind("a.b.acme.com")).toBe("subdomain");
  });

  it("rejects OpenDocs domains, reserved names, IPs and malformed input", () => {
    const reason = (input: string) => {
      const result = validateCustomHostname(input);
      return result.ok ? "ok" : result.reason;
    };
    expect(reason("opendocs.cc")).toBe("opendocs");
    expect(reason("notes.opendocs.cc")).toBe("opendocs");
    expect(reason("custom.opendocs.cc")).toBe("opendocs");
    expect(reason("intranet.local")).toBe("reserved");
    expect(reason("docs.test")).toBe("reserved");
    expect(reason("notes.example.com")).toBe("reserved");
    expect(reason("localhost")).toBe("reserved");
    expect(reason("1.2.3.4")).toBe("ip_address");
    expect(reason("notes")).toBe("single_label");
    expect(reason("")).toBe("empty");
    expect(reason("notes.acme.io:8443")).toBe("invalid");
    expect(reason("notes.acme.io/docs")).toBe("invalid");
    expect(reason("user@notes.acme.io")).toBe("invalid");
    expect(reason("-bad.acme.io")).toBe("invalid");
    expect(reason("a..acme.io")).toBe("invalid");
    expect(reason("notes.acme.123")).toBe("invalid");
    expect(reason(`${"a".repeat(64)}.acme.io`)).toBe("invalid");
  });

  it("allows *.localhost for local testing outside production only", () => {
    expect(validateCustomHostname("notes.localhost")).toEqual({
      ok: true,
      hostname: "notes.localhost",
      kind: "subdomain",
    });
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(validateCustomHostname("notes.localhost")).toMatchObject({ ok: false, reason: "reserved" });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("parses Host headers with ports and recognizes OpenDocs' own hosts", () => {
    expect(normalizeHostHeader("Notes.LOCALHOST:3600")).toBe("notes.localhost");
    expect(normalizeHostHeader("[::1]:3000")).toBe("::1");
    expect(isOpenDocsHost("opendocs.cc")).toBe(true);
    expect(isOpenDocsHost("www.opendocs.cc")).toBe(true);
    expect(isOpenDocsHost("localhost")).toBe(true);
    expect(isOpenDocsHost("127.0.0.1")).toBe(true);
    expect(isOpenDocsHost("web")).toBe(true);
    expect(isOpenDocsHost("notes.localhost")).toBe(false);
    expect(isOpenDocsHost("notes.example.is")).toBe(false);
  });

  it("maps paths between opendocs.cc and the custom domain", () => {
    expect(stripWorkspacePrefix("acme", "/acme")).toBe("/");
    expect(stripWorkspacePrefix("acme", "/acme/plan")).toBe("/plan");
    expect(stripWorkspacePrefix("acme", "/acme?sort=title-asc")).toBe("/?sort=title-asc");
    expect(stripWorkspacePrefix("acme", "/acmecorp/plan")).toBeNull();
    expect(workspaceRoutePath("acme", "/")).toBe("/acme");
    expect(workspaceRoutePath("acme", "/projects/launch/tag/q3")).toBe("/acme/projects/launch/tag/q3");
    expect(customDomainUrl("notes.acmecorp.io", "acme", "/acme/projects/launch/plan")).toBe(
      "https://notes.acmecorp.io/projects/launch/plan",
    );
    expect(customDomainUrl("notes.acmecorp.io", "acme", "/acme")).toBe("https://notes.acmecorp.io");
  });

  it("keeps documents whose slug is an app path on opendocs.cc", () => {
    expect(isServedOnCustomDomain("acme", "/acme")).toBe(true);
    expect(isServedOnCustomDomain("acme", "/acme/plan")).toBe(true);
    expect(isServedOnCustomDomain("acme", "/acme/onboarding-guide")).toBe(true);
    expect(isServedOnCustomDomain("acme", "/acme/projects/launch/onboarding")).toBe(true);
    expect(isServedOnCustomDomain("acme", "/acme/onboarding")).toBe(false);
    expect(isServedOnCustomDomain("acme", "/acme/login?x=1")).toBe(false);
    expect(isServedOnCustomDomain("acme", "/acme/healthz")).toBe(false);
    expect(isServedOnCustomDomain("acme", "/other/plan")).toBe(false);
  });

  it("only accepts relative return paths after sign-in", () => {
    expect(safeReturnPath("/plan")).toBe("/plan");
    expect(safeReturnPath("/projects/launch/plan?v=2#risks")).toBe("/projects/launch/plan?v=2#risks");
    for (const attempt of [
      "//evil.example",
      "/\\evil.example",
      "https://evil.example/",
      "javascript:alert(1)",
      "evil.example",
      "/\tfoo",
      "/foo\nbar",
      "",
      null,
      `/${"a".repeat(3000)}`,
    ]) {
      expect(safeReturnPath(attempt)).toBeNull();
    }
  });
});

// ---- Plans and permissions ---------------------------------------------------------

describe("custom domain plans and permissions", () => {
  it("requires Pro or Team, counting complimentary tiers", async () => {
    const free = await createOnboardedUser();
    const blocked = await putDomain(free, uniqueHost());
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ error: "plan_required", tier: "free" });
    expect(blocked.body.docs_url).toContain("/errors#plan-required");
    expect(await domainRow(free.workspaceId)).toBeUndefined();

    const pro = await createOnboardedUser();
    await setUserPlan(pro.userId, "pro");
    expect((await putDomain(pro, uniqueHost())).status).toBe(200);

    const team = await createOnboardedUser();
    await setWorkspacePlan(team.workspaceId, "team");
    expect((await putDomain(team, uniqueHost())).status).toBe(200);

    const founder = await createOnboardedUser();
    await setCompedTier(founder.userId, "friends");
    const founderSave = await putDomain(founder, uniqueHost());
    expect(founderSave.status).toBe(200);
    expect(founderSave.body.plan).toEqual({ tier: "pro", allowed: true });

    const creator = await createOnboardedUser();
    await setCompedTier(creator.userId, "creator");
    const creatorSave = await putDomain(creator, uniqueHost());
    expect(creatorSave.status).toBe(200);
    expect(creatorSave.body.plan).toEqual({ tier: "team", allowed: true });
  });

  it("lets members read the domain but only owners and admins change it", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    const member = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    await setUserPlan(owner.userId, "pro");
    await db()
      .insert(schema.workspaceMembers)
      .values({ workspaceId: owner.workspaceId, userId: member.userId, role: "member", status: "active" });
    const hostname = uniqueHost();
    expect((await putDomain(owner, hostname)).status).toBe(200);

    const read = await request(app)
      .get("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(member.apiKey));
    expect(read.status).toBe(200);
    expect(read.body.domain.hostname).toBe(hostname);

    const write = await request(app)
      .put("/api/v1/workspace/domain")
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: owner.workspaceId, hostname: uniqueHost() });
    expect(write.status).toBe(403);
    expect(write.body.error).toBe("forbidden");

    const remove = await request(app)
      .delete("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(member.apiKey));
    expect(remove.status).toBe(403);

    const check = await request(app)
      .post("/api/v1/workspace/domain/check")
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: owner.workspaceId });
    expect(check.status).toBe(403);

    const notMember = await request(app)
      .get("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(outsider.apiKey));
    expect(notMember.status).toBe(404);

    // Session cookies work as well as API keys.
    const bySession = await owner.agent.get("/api/v1/workspace/domain").query({ workspaceId: owner.workspaceId });
    expect(bySession.status).toBe(200);
  });

  it("explains invalid hostnames and records, and removes the domain", async () => {
    const app = await getTestApp();
    const owner = await createOnboardedUser();
    await setUserPlan(owner.userId, "pro");

    const invalid = await putDomain(owner, "notes.opendocs.cc");
    expect(invalid.status).toBe(400);
    expect(invalid.body).toMatchObject({ error: "invalid_hostname", reason: "opendocs" });
    expect(invalid.body.message).toBeTruthy();

    // Apex domains need this server's IPv4 address to be configured.
    const apexUnconfigured = await putDomain(owner, "acmecorp-apex.io");
    expect(apexUnconfigured.status).toBe(400);
    expect(apexUnconfigured.body.reason).toBe("apex_unsupported");

    const hostname = uniqueHost();
    const saved = await putDomain(owner, hostname);
    expect(saved.status).toBe(200);
    expect(saved.body.domain).toMatchObject({
      hostname,
      kind: "subdomain",
      status: "pending",
      state: "pending",
      serving: false,
      url: `https://${hostname}`,
    });
    const [cname, txt] = saved.body.domain.records;
    expect(cname).toMatchObject({ type: "CNAME", name: hostname, value: TARGET, purpose: "routing" });
    expect(txt).toMatchObject({ type: "TXT", name: `_opendocs.${hostname}`, purpose: "verification" });
    expect(txt.value).toMatch(/^opendocs-verify=[A-Za-z0-9_-]{20,}$/);
    expect(cname.host).toBe(hostname.split(".")[0]);
    expect(txt.host).toBe(`_opendocs.${hostname.split(".")[0]}`);

    // Saving the same name again keeps the token, so DNS stays valid.
    const again = await putDomain(owner, hostname.toUpperCase());
    expect(again.body.domain.records[1].value).toBe(txt.value);

    const removed = await request(app)
      .delete("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(owner.apiKey));
    expect(removed.status).toBe(200);
    expect(removed.body).toEqual({ removed: true, hostname });
    expect(await domainRow(owner.workspaceId)).toBeUndefined();
  });
});

// ---- DNS verification --------------------------------------------------------------

describe("custom domain verification", () => {
  it("activates with TXT + CNAME", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    const row = await domainRow(owner.workspaceId);
    expect(row).toMatchObject({ hostname, status: "active", consecutiveFailures: 0, lastError: null });
    expect(row?.verifiedAt).toBeInstanceOf(Date);

    const app = await getTestApp();
    const view = await request(app)
      .get("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(owner.apiKey));
    // Records just checked out: the first certificate is issued on the first visit.
    expect(view.body.domain).toMatchObject({ status: "active", state: "verifying", serving: true });
    expect(view.body.domain.records.map((record: { check: string }) => record.check)).toEqual(["ok", "ok"]);
  });

  it("activates an apex domain with TXT + A records to our address", async () => {
    process.env.CUSTOM_DOMAIN_IPV4 = "203.0.113.10";
    const owner = await createOnboardedUser();
    await setUserPlan(owner.userId, "pro");
    const hostname = `acme${Date.now().toString(36)}.io`;
    const saved = await putDomain(owner, hostname);
    expect(saved.status).toBe(200);
    expect(saved.body.domain.kind).toBe("apex");
    const [a, txt] = saved.body.domain.records;
    expect(a).toMatchObject({ type: "A", value: "203.0.113.10", host: "@" });

    publishRecords(hostname, txt.value, { a: ["203.0.113.10"] });
    const row = await runCustomDomainCheck((await domainRow(owner.workspaceId))!, "manual");
    expect(row.status).toBe("active");
    expect((row.lastCheck as { matchedBy: string }).matchedBy).toBe("a");
  });

  it("stays pending and names the record that's missing or wrong", async () => {
    const owner = await createOnboardedUser();
    await setUserPlan(owner.userId, "pro");
    const hostname = uniqueHost();
    const saved = await putDomain(owner, hostname);
    const txtValue = saved.body.domain.records[1].value as string;
    const check = async () => {
      const row = await runCustomDomainCheck((await domainRow(owner.workspaceId))!, "manual");
      return { status: row.status, error: row.lastError };
    };

    expect(saved.body.domain.lastError.code).toBe("target_missing");
    expect(saved.body.domain.lastError.message).toContain(TARGET);

    dns.cname = { [hostname]: TARGET };
    expect(await check()).toEqual({ status: "pending", error: "txt_missing" });

    dns.txt = { [`_opendocs.${hostname}`]: ["opendocs-verify=someone-elses-token"] };
    expect(await check()).toEqual({ status: "pending", error: "txt_mismatch" });

    dns.txt = { [`_opendocs.${hostname}`]: [txtValue] };
    dns.cname = { [hostname]: "other-host.example.net" };
    expect(await check()).toEqual({ status: "pending", error: "target_mismatch" });

    dns.cname = {};
    dns.a = { [hostname]: ["104.21.3.4", "172.67.1.2"] };
    expect(await check()).toEqual({ status: "pending", error: "cloudflare_proxied" });

    dns.a = {};
    dns.cname = { [hostname]: `${TARGET}.` };
    expect(await check()).toEqual({ status: "active", error: null });
  });

  it("stops serving after three scheduled failures in a row, emails the owner, and recovers", async () => {
    const { owner, hostname, txtValue } = await ownerWithActiveDomain();
    const outboxBefore = devOutbox.length;
    removeRecords(hostname);

    // Manual checks and DNS timeouts report the problem but don't count.
    let row = await runCustomDomainCheck((await domainRow(owner.workspaceId))!, "manual");
    expect(row).toMatchObject({ status: "active", consecutiveFailures: 0, lastError: "target_missing" });
    dns.broken = [hostname];
    row = await runCustomDomainCheck(row, "scheduled");
    expect(row).toMatchObject({ status: "active", consecutiveFailures: 0, lastError: "dns_error" });
    dns.broken = [];

    for (let failure = 1; failure < CUSTOM_DOMAIN_FAILURE_LIMIT; failure += 1) {
      row = await runCustomDomainCheck(row, "scheduled");
      expect(row).toMatchObject({ status: "active", consecutiveFailures: failure });
      expect(row.failingSince).toBeInstanceOf(Date);
    }
    row = await runCustomDomainCheck(row, "scheduled");
    expect(row).toMatchObject({ status: "misconfigured", consecutiveFailures: CUSTOM_DOMAIN_FAILURE_LIMIT });

    const emails = devOutbox.slice(outboxBefore);
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({ to: owner.email, subject: `${hostname} stopped working on OpenDocs` });

    // Not served while misconfigured: tls-ask refuses it.
    const internal = createInternalApp();
    clearCustomDomainCaches();
    expect((await request(internal).get("/internal/tls-ask").query({ domain: hostname })).status).toBe(404);

    // Records back: the next scheduled check restores it.
    publishRecords(hostname, txtValue);
    await db()
      .update(schema.workspaceCustomDomains)
      .set({ lastCheckedAt: new Date(Date.now() - 7 * 60 * 60 * 1000) })
      .where(eq(schema.workspaceCustomDomains.id, row.id));
    const summary = await recheckDueCustomDomains({ limit: 500 });
    expect(summary.recovered).toBeGreaterThanOrEqual(1);
    row = (await domainRow(owner.workspaceId))!;
    expect(row).toMatchObject({ status: "active", consecutiveFailures: 0, lastError: null, failingSince: null });
    expect((await request(internal).get("/internal/tls-ask").query({ domain: hostname })).status).toBe(200);
  });

  it("only re-checks domains whose last check is older than six hours", async () => {
    const { owner } = await ownerWithActiveDomain();
    const before = (await domainRow(owner.workspaceId))!.lastCheckedAt;
    await recheckDueCustomDomains({ limit: 500 });
    expect((await domainRow(owner.workspaceId))!.lastCheckedAt).toEqual(before);
  });
});

// ---- Taking a domain -----------------------------------------------------------------

describe("custom domain ownership", () => {
  it("refuses a hostname another workspace has active", async () => {
    const { hostname } = await ownerWithActiveDomain();
    const other = await createOnboardedUser();
    await setUserPlan(other.userId, "pro");
    const taken = await putDomain(other, hostname);
    expect(taken.status).toBe(409);
    expect(taken.body).toMatchObject({ error: "domain_taken" });
    expect(taken.body.docs_url).toContain("/errors#domain-taken");
  });

  it("hands a lapsed domain over only once the old workspace's TXT value is gone", async () => {
    const { owner: first, hostname, txtValue: firstTxt } = await ownerWithActiveDomain();
    // The first workspace's DNS lapses until it's misconfigured.
    removeRecords(hostname);
    let firstRow = (await domainRow(first.workspaceId))!;
    for (let i = 0; i < CUSTOM_DOMAIN_FAILURE_LIMIT; i += 1) {
      firstRow = await runCustomDomainCheck(firstRow, "scheduled");
    }
    expect(firstRow.status).toBe("misconfigured");

    const second = await createOnboardedUser();
    await setUserPlan(second.userId, "pro");
    const saved = await putDomain(second, hostname);
    expect(saved.status).toBe(200);
    const secondTxt = saved.body.domain.records[1].value as string;

    // Both values published: ambiguous, nobody gets it.
    dns.txt = { [`_opendocs.${hostname}`]: [firstTxt, secondTxt] };
    dns.cname = { [hostname]: TARGET };
    let secondRow = await runCustomDomainCheck((await domainRow(second.workspaceId))!, "manual");
    expect(secondRow).toMatchObject({ status: "pending", lastError: "txt_conflict" });

    dns.txt = { [`_opendocs.${hostname}`]: [secondTxt] };
    secondRow = await runCustomDomainCheck(secondRow, "manual");
    expect(secondRow.status).toBe("active");

    // The first workspace can't take it back while the second holds it.
    dns.txt = { [`_opendocs.${hostname}`]: [firstTxt, secondTxt] };
    firstRow = await runCustomDomainCheck(firstRow, "manual");
    expect(firstRow).toMatchObject({ status: "misconfigured", lastError: "domain_taken" });
  });
});

// ---- tls-ask -------------------------------------------------------------------------

describe("tls-ask", () => {
  it("allows certificates only for active domains on Pro or Team workspaces", async () => {
    const internal = createInternalApp();
    const ask = (domain?: string) =>
      request(internal).get("/internal/tls-ask").query(domain === undefined ? {} : { domain });

    const { owner, hostname } = await ownerWithActiveDomain();
    expect((await ask(hostname)).status).toBe(200);
    expect((await ask(hostname.toUpperCase())).status).toBe(200);

    const pendingOwner = await createOnboardedUser();
    await setUserPlan(pendingOwner.userId, "pro");
    const pendingHost = uniqueHost("pending");
    await putDomain(pendingOwner, pendingHost);
    expect((await ask(pendingHost)).status).toBe(404);

    expect((await ask("unknown.acmecorp.io")).status).toBe(404);
    expect((await ask("opendocs.cc")).status).toBe(404);
    expect((await ask()).status).toBe(404);

    // A downgrade pauses the domain: no new certificates.
    await setUserPlan(owner.userId, "free");
    clearCustomDomainCaches();
    expect((await ask(hostname)).status).toBe(404);
  });

  it("isn't served by the public API app", async () => {
    const app = await getTestApp();
    expect((await request(app).get("/internal/tls-ask").query({ domain: "x.acmecorp.io" })).status).toBe(404);
  });
});

// ---- CORS ----------------------------------------------------------------------------

describe("CORS for custom domains", () => {
  it("allows active custom domains on public reader endpoints, without credentials", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    const published = await publish(owner, { title: "Plan", visibility: "public", confirmPublic: true });
    expect(published.status).toBe(201);
    const origin = `https://${hostname}`;
    const rawPath = `/api/v1/public/posts/${owner.workspaceSlug}/${published.body.slug}/raw`;

    const raw = await request(app).get(rawPath).set("Origin", origin);
    expect(raw.status).toBe(200);
    expect(raw.headers["access-control-allow-origin"]).toBe(origin);
    expect(raw.headers["access-control-allow-credentials"]).toBeUndefined();

    const preflight = await request(app)
      .options(`/api/v1/public/posts/${owner.workspaceSlug}/${published.body.slug}/export/pdf`)
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type");
    expect(preflight.status).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe(origin);
    expect(preflight.headers["access-control-allow-credentials"]).toBeUndefined();

    // Not on any other endpoint.
    const me = await request(app).get("/api/v1/me").set("Origin", origin);
    expect(me.headers["access-control-allow-origin"]).toBeUndefined();
    const domainEndpoint = await request(app)
      .options("/api/v1/workspace/domain")
      .set("Origin", origin)
      .set("Access-Control-Request-Method", "PUT");
    expect(domainEndpoint.headers["access-control-allow-origin"]).toBeUndefined();

    // Not for hosts that aren't connected, or over plain http.
    const unknown = await request(app).get(rawPath).set("Origin", "https://evil.acmecorp.io");
    expect(unknown.headers["access-control-allow-origin"]).toBeUndefined();
    const plainHttp = await request(app).get(rawPath).set("Origin", `http://${hostname}`);
    expect(plainHttp.headers["access-control-allow-origin"]).toBeUndefined();

    // Paused after a downgrade.
    await setUserPlan(owner.userId, "free");
    clearCustomDomainCaches();
    const paused = await request(app).get(rawPath).set("Origin", origin);
    expect(paused.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("keeps credentials for OpenDocs' own origins", async () => {
    const app = await getTestApp();
    const response = await request(app).get("/api/v1/me").set("Origin", "http://localhost:3000");
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });
});

// ---- publicUrl -----------------------------------------------------------------------

describe("publicUrl", () => {
  it("is the custom-domain URL for published documents of any visibility", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    const base = openDocsWebUrl();

    const pub = await publish(owner, { title: "Plan", visibility: "public", confirmPublic: true });
    expect(pub.status).toBe(201);
    expect(pub.body.url).toBe(`/${owner.workspaceSlug}/${pub.body.slug}`);
    expect(pub.body.publicUrl).toBe(`https://${hostname}/${pub.body.slug}`);

    // Workspace-only documents live on the domain too; readers sign in there.
    const internal = await publish(owner, { title: "Internal notes", visibility: "workspace" });
    expect(internal.body.publicUrl).toBe(`https://${hostname}/${internal.body.slug}`);

    // /onboarding on the custom domain is OpenDocs' own page, so this one
    // stays on opendocs.cc.
    const appPath = await publish(owner, {
      markdown: "# Onboarding\n\nDay one.",
      visibility: "public",
      confirmPublic: true,
    });
    expect(appPath.body.slug).toBe("onboarding");
    expect(appPath.body.publicUrl).toBe(`${base}/${owner.workspaceSlug}/onboarding`);

    const got = await request(app).get(`/api/v1/posts/${pub.body.postId}`).set(authHeaders(owner.apiKey));
    expect(got.body.post).toMatchObject({ url: pub.body.url, publicUrl: pub.body.publicUrl });

    const list = await request(app)
      .get("/api/v1/posts")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(owner.apiKey));
    const byId = new Map(list.body.posts.map((post: { id: string }) => [post.id, post]));
    expect(byId.get(pub.body.postId)).toMatchObject({ url: pub.body.url, publicUrl: pub.body.publicUrl });
    expect(byId.get(internal.body.postId)).toMatchObject({ publicUrl: internal.body.publicUrl });

    const updated = await request(app)
      .post(`/api/v1/posts/${pub.body.postId}/update`)
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId, markdown: "# Plan\n\nWe ship in June." });
    expect(updated.status, JSON.stringify(updated.body)).toBe(200);
    expect(updated.body.publicUrl).toBe(pub.body.publicUrl);

    const madePublic = await request(app)
      .post(`/api/v1/posts/${internal.body.postId}/visibility`)
      .set(authHeaders(owner.apiKey))
      .send({ visibility: "public", confirmPublic: true });
    expect(madePublic.status).toBe(200);
    expect(madePublic.body).toMatchObject({
      url: internal.body.url,
      publicUrl: `https://${hostname}/${internal.body.slug}`,
    });

    // Paused after a downgrade: opendocs.cc links again; `url` never changes.
    await setUserPlan(owner.userId, "free");
    clearCustomDomainCaches();
    const afterDowngrade = await request(app).get(`/api/v1/posts/${pub.body.postId}`).set(authHeaders(owner.apiKey));
    expect(afterDowngrade.body.post).toMatchObject({
      url: pub.body.url,
      publicUrl: `${base}${pub.body.url}`,
    });
  });

  it("covers projects, moves and batch publishing (JSON and stream)", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    const project = await request(app)
      .post("/api/v1/projects")
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId, name: "Launch" });
    expect(project.status).toBeLessThan(300);
    const projectSlug = (project.body.project ?? project.body).slug as string;

    const doc = await publish(owner, { title: "Risks", visibility: "public", confirmPublic: true, projectSlug });
    expect(doc.body.publicUrl).toBe(`https://${hostname}/projects/${projectSlug}/${doc.body.slug}`);

    const moved = await request(app)
      .post(`/api/v1/posts/${doc.body.postId}/move`)
      .set(authHeaders(owner.apiKey))
      .send({ projectSlug: "default" });
    expect(moved.status).toBe(200);
    expect(moved.body.publicUrl).toBe(`https://${hostname}/${moved.body.slug}`);

    const documents = [
      { title: "One", markdown: "# One", workspaceId: owner.workspaceId, visibility: "public", confirmPublic: true },
      { title: "Two", markdown: "# Two", workspaceId: owner.workspaceId, visibility: "private" },
    ];
    const batch = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(owner.apiKey))
      .send({ documents });
    expect(batch.status).toBe(207);
    const [one, two] = batch.body.results;
    expect(one.publicUrl).toBe(`https://${hostname}/${one.slug}`);
    expect(two.publicUrl).toBe(`https://${hostname}/${two.slug}`);

    const stream = await request(app)
      .post("/api/v1/publish/batch")
      .set(authHeaders(owner.apiKey))
      .set("Accept", "text/event-stream")
      .send({ documents: [documents[0]] });
    const frame = stream.text.split("\n").find((line) => line.startsWith("data: {\"success\""));
    expect(frame).toBeTruthy();
    const streamed = JSON.parse(frame!.slice("data: ".length));
    expect(streamed.publicUrl).toBe(`https://${hostname}/${streamed.slug}`);
  });
});

// ---- Sign-in bridge -----------------------------------------------------------------

describe("custom domain sign-in bridge", () => {
  async function bridgeFor(hostname: string, owner: Owner, returnPath: unknown = "/plan") {
    const state = newBridgeSecret();
    const result = await createBridgeCode({
      userId: owner.userId,
      sessionId: await latestSessionId(owner.userId),
      hostname,
      state,
      returnPath,
    });
    return { state, result };
  }

  it("only skips the confirmation step for active members of the domain's workspace", async () => {
    const { owner } = await ownerWithActiveDomain();
    const member = await createOnboardedUser();
    const outsider = await createOnboardedUser();
    await db().insert(schema.workspaceMembers).values({
      workspaceId: owner.workspaceId,
      userId: member.userId,
      role: "member",
      status: "active",
    });

    expect(await isActiveWorkspaceMember(owner.userId, owner.workspaceId)).toBe(true);
    expect(await isActiveWorkspaceMember(member.userId, owner.workspaceId)).toBe(true);
    expect(await isActiveWorkspaceMember(outsider.userId, owner.workspaceId)).toBe(false);

    await db()
      .update(schema.workspaceMembers)
      .set({ status: "disabled" })
      .where(
        and(
          eq(schema.workspaceMembers.workspaceId, owner.workspaceId),
          eq(schema.workspaceMembers.userId, member.userId),
        ),
      );
    expect(await isActiveWorkspaceMember(member.userId, owner.workspaceId)).toBe(false);
  });

  it("only lets non-members through when something published there is shared with them", async () => {
    const app = await getTestApp();
    const { owner } = await ownerWithActiveDomain();
    const other = await createOnboardedUser();
    const guestDomain = uniqueHost("guests");
    const guest = await createOnboardedUser({ email: `guest@${guestDomain}` });
    const colleague = await createOnboardedUser({ email: `colleague@${guestDomain}` });
    for (const reader of [guest, colleague]) {
      await db().update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, reader.userId));
    }
    const share = (author: Owner, postId: string, body: Record<string, unknown>) =>
      request(app)
        .post(`/api/v1/posts/${postId}/share`)
        .set(authHeaders(author.apiKey))
        .send({ notify: false, ...body });

    // Shared in another workspace doesn't count here.
    const elsewhere = await request(app)
      .post("/api/v1/publish")
      .set(authHeaders(other.apiKey))
      .send({ workspaceId: other.workspaceId, markdown: "# Other\n\nElsewhere.", visibility: "private" });
    expect((await share(other, elsewhere.body.postId, { emails: [guest.email] })).status).toBe(200);
    expect(await hasDocumentsSharedInWorkspace(guest.userId, owner.workspaceId)).toBe(false);

    const doc = await publish(owner, { visibility: "private" });
    const postId = doc.body.postId as string;
    expect((await share(owner, postId, { emails: [guest.email.toUpperCase()] })).status).toBe(200);
    expect(await hasDocumentsSharedInWorkspace(guest.userId, owner.workspaceId)).toBe(true);
    expect(await hasDocumentsSharedInWorkspace(colleague.userId, owner.workspaceId)).toBe(false);

    // A domain share covers everyone at that domain.
    expect((await share(owner, postId, { domains: [`@${guestDomain}`] })).status).toBe(200);
    expect(await hasDocumentsSharedInWorkspace(colleague.userId, owner.workspaceId)).toBe(true);

    // Unverified addresses and unpublished documents don't count.
    await db().update(schema.user).set({ emailVerified: false }).where(eq(schema.user.id, guest.userId));
    expect(await hasDocumentsSharedInWorkspace(guest.userId, owner.workspaceId)).toBe(false);
    await db().update(schema.user).set({ emailVerified: true }).where(eq(schema.user.id, guest.userId));
    const unpublished = await request(app)
      .post(`/api/v1/posts/${postId}/unpublish`)
      .set(authHeaders(owner.apiKey));
    expect(unpublished.status).toBe(200);
    expect(await hasDocumentsSharedInWorkspace(guest.userId, owner.workspaceId)).toBe(false);
  });

  it("trades a one-time code for a viewer session on that host only", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    const { state, result } = await bridgeFor(hostname, owner, "/projects/launch/plan?v=2");
    if ("error" in result) throw new Error(result.error);
    expect(result.origin).toBe(`https://${hostname}`);

    // The code is stored hashed.
    const [stored] = await db()
      .select()
      .from(schema.customDomainBridgeCodes)
      .where(eq(schema.customDomainBridgeCodes.hostname, hostname));
    expect(stored.codeHash).not.toBe(result.code);
    expect(stored.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(60_000);

    // Wrong state or wrong host: refused, and the code is still unused.
    expect(await exchangeBridgeCode({ code: result.code, state: newBridgeSecret(), hostname })).toEqual({
      error: "invalid_code",
    });
    expect(await exchangeBridgeCode({ code: result.code, state, hostname: "other.acmecorp.io" })).toEqual({
      error: "invalid_code",
    });

    const exchanged = await exchangeBridgeCode({ code: result.code, state, hostname });
    if ("error" in exchanged) throw new Error(exchanged.error);
    expect(exchanged.returnPath).toBe("/projects/launch/plan?v=2");
    expect(exchanged.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 60 * 60 * 1000);

    // Single use.
    expect(await exchangeBridgeCode({ code: result.code, state, hostname })).toEqual({ error: "invalid_code" });

    const viewer = await getViewerSession(exchanged.token, hostname);
    expect(viewer?.user).toMatchObject({ id: owner.userId, email: owner.email });
    expect(await getViewerSession(exchanged.token, "other.acmecorp.io")).toBeNull();
    expect(await getViewerSession("not-a-token", hostname)).toBeNull();

    await revokeViewerSession(exchanged.token);
    expect(await getViewerSession(exchanged.token, hostname)).toBeNull();
  });

  it("expires codes after 60 seconds", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    const { state, result } = await bridgeFor(hostname, owner);
    if ("error" in result) throw new Error(result.error);
    await db()
      .update(schema.customDomainBridgeCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.customDomainBridgeCodes.hostname, hostname));
    expect(await exchangeBridgeCode({ code: result.code, state, hostname })).toEqual({ error: "invalid_code" });
  });

  it("refuses hosts that aren't serving and return paths that leave the host", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    for (const attempt of ["//evil.example/x", "https://evil.example", "/\\evil.example", "javascript:alert(1)"]) {
      expect((await bridgeFor(hostname, owner, attempt)).result).toEqual({ error: "invalid_return" });
    }
    expect((await bridgeFor("evil.acmecorp.io", owner)).result).toEqual({ error: "not_connected" });
    expect((await bridgeFor("opendocs.cc", owner)).result).toEqual({ error: "not_connected" });

    const state = await createBridgeCode({
      userId: owner.userId,
      sessionId: await latestSessionId(owner.userId),
      hostname,
      state: "short",
      returnPath: "/",
    });
    expect(state).toEqual({ error: "invalid_state" });

    const pendingOwner = await createOnboardedUser();
    await setUserPlan(pendingOwner.userId, "pro");
    const pendingHost = uniqueHost("pending");
    await putDomain(pendingOwner, pendingHost);
    expect((await bridgeFor(pendingHost, pendingOwner)).result).toEqual({ error: "not_connected" });

    // Paused by a downgrade.
    await setUserPlan(owner.userId, "free");
    expect((await bridgeFor(hostname, owner)).result).toEqual({ error: "not_connected" });
  });

  it("ends viewer sessions when the opendocs.cc session ends or the domain is removed", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    const sessionToken = async () => {
      const { state, result } = await bridgeFor(hostname, owner);
      if ("error" in result) throw new Error(result.error);
      const exchanged = await exchangeBridgeCode({ code: result.code, state, hostname });
      if ("error" in exchanged) throw new Error(exchanged.error);
      return exchanged.token;
    };

    // Signing out of opendocs.cc deletes the session row, and with it the
    // viewer sessions made from it.
    const fromCookieSession = await sessionToken();
    expect(await getViewerSession(fromCookieSession, hostname)).not.toBeNull();
    const signOut = await owner.agent.post("/api/auth/sign-out").set("Origin", "http://127.0.0.1:4000").send({});
    expect(signOut.status).toBe(200);
    expect(await getViewerSession(fromCookieSession, hostname)).toBeNull();

    // A new opendocs.cc session; revoking it (session row deleted) works too.
    const signIn = await owner.agent
      .post("/api/auth/sign-in/email")
      .send({ email: owner.email, password: owner.password });
    expect(signIn.status).toBe(200);
    const revoked = await sessionToken();
    await db().delete(schema.session).where(eq(schema.session.id, await latestSessionId(owner.userId)));
    expect(await getViewerSession(revoked, hostname)).toBeNull();

    // Removing the domain ends every sign-in on it.
    await owner.agent.post("/api/auth/sign-in/email").send({ email: owner.email, password: owner.password });
    const beforeRemoval = await sessionToken();
    await request(app)
      .delete("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(owner.apiKey));
    expect(await getViewerSession(beforeRemoval, hostname)).toBeNull();
    const left = await db()
      .select()
      .from(schema.customDomainSessions)
      .where(and(eq(schema.customDomainSessions.hostname, hostname)));
    expect(left).toHaveLength(0);
  });

  it("refuses a code whose opendocs.cc session ended before the exchange", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    const { state, result } = await bridgeFor(hostname, owner);
    if ("error" in result) throw new Error(result.error);
    await db()
      .update(schema.session)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.session.id, await latestSessionId(owner.userId)));
    expect(await exchangeBridgeCode({ code: result.code, state, hostname })).toEqual({ error: "session_ended" });
  });
});

// ---- Reading a workspace on its domain -------------------------------------------

describe("custom domain reading and settings", () => {
  async function viewerToken(hostname: string, user: Owner) {
    const state = newBridgeSecret();
    const code = await createBridgeCode({
      userId: user.userId,
      sessionId: await latestSessionId(user.userId),
      hostname,
      state,
      returnPath: "/",
    });
    if ("error" in code) throw new Error(code.error);
    const exchanged = await exchangeBridgeCode({ code: code.code, state, hostname });
    if ("error" in exchanged) throw new Error(exchanged.error);
    return exchanged.token;
  }

  it("falls back to opendocs.cc for unpublished documents and finds the domain by slug", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    const doc = await publish(owner, { title: "Draft notes", visibility: "workspace" });
    expect(doc.body.publicUrl).toBe(`https://${hostname}/${doc.body.slug}`);

    const unpublished = await request(app)
      .post(`/api/v1/posts/${doc.body.postId}/unpublish`)
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId });
    expect(unpublished.status).toBe(200);
    const got = await request(app).get(`/api/v1/posts/${doc.body.postId}`).set(authHeaders(owner.apiKey));
    expect(got.body.post.publicUrl).toBe(`${openDocsWebUrl()}/${owner.workspaceSlug}/${doc.body.slug}`);

    expect((await getServingCustomDomainForSlug(owner.workspaceSlug.toUpperCase()))?.hostname).toBe(hostname);
    expect(await getServingCustomDomainForSlug("no-such-workspace")).toBeNull();
  });

  it("lets owners and admins hide Published with OpenDocs", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    expect((await lookupCustomHost(hostname))?.showPoweredBy).toBe(true);

    const member = await createOnboardedUser();
    await db().insert(schema.workspaceMembers).values({
      workspaceId: owner.workspaceId,
      userId: member.userId,
      role: "member",
      status: "active",
    });
    const denied = await request(app)
      .patch("/api/v1/workspace/domain")
      .set(authHeaders(member.apiKey))
      .send({ workspaceId: owner.workspaceId, showPoweredBy: false });
    expect(denied.status).toBe(403);

    const hidden = await request(app)
      .patch("/api/v1/workspace/domain")
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId, showPoweredBy: false });
    expect(hidden.status, JSON.stringify(hidden.body)).toBe(200);
    expect(hidden.body.domain.showPoweredBy).toBe(false);
    expect((await lookupCustomHost(hostname))?.showPoweredBy).toBe(false);

    const invalid = await request(app)
      .patch("/api/v1/workspace/domain")
      .set(authHeaders(owner.apiKey))
      .send({ workspaceId: owner.workspaceId, showPoweredBy: "no" });
    expect(invalid.status).toBe(400);
  });

  it("downloads private documents with a domain sign-in, for that domain's workspace only", async () => {
    const app = await getTestApp();
    const { owner, hostname } = await ownerWithActiveDomain();
    const doc = await publish(owner, { markdown: "# Board minutes\n\nQuiet quarter.", visibility: "workspace" });
    expect(doc.status).toBe(201);
    const rawPath = `/api/v1/public/posts/${owner.workspaceSlug}/${doc.body.slug}/raw`;

    // Anonymous: not found, as before.
    expect((await request(app).get(rawPath)).status).toBe(404);

    const token = await viewerToken(hostname, owner);
    const viewer = { "x-opendocs-viewer-session": token, "x-opendocs-viewer-host": hostname };
    const raw = await request(app).get(rawPath).set(viewer);
    expect(raw.status).toBe(200);
    expect(raw.text).toContain("Quiet quarter.");

    // A forged or foreign token is anonymous again.
    const forged = await request(app)
      .get(rawPath)
      .set({ ...viewer, "x-opendocs-viewer-session": newBridgeSecret() });
    expect(forged.status).toBe(404);
    expect(
      (await request(app).get(rawPath).set({ ...viewer, "x-opendocs-viewer-host": "other.acmecorp.io" })).status,
    ).toBe(404);

    // The same reader is also a member of another workspace, but this
    // domain's sign-in only reads this domain's workspace.
    const other = await createOnboardedUser();
    await db().insert(schema.workspaceMembers).values({
      workspaceId: other.workspaceId,
      userId: owner.userId,
      role: "member",
      status: "active",
    });
    const elsewhere = await publish(other, { markdown: "# Elsewhere\n\nNot here.", visibility: "workspace" });
    const elsewherePath = `/api/v1/public/posts/${other.workspaceSlug}/${elsewhere.body.slug}/raw`;
    expect((await request(app).get(elsewherePath).set(authHeaders(owner.apiKey))).status).toBe(200);
    expect((await request(app).get(elsewherePath).set(viewer)).status).toBe(404);
    expect(
      (await request(app).get(`/api/v1/public/workspaces/${other.workspaceSlug}/markdown.zip`).set(viewer)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/api/v1/public/workspaces/${owner.workspaceSlug}/markdown.zip`).set(viewer)).status,
    ).toBe(200);
  });

  it("signs out of opendocs.cc and every custom domain at once", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    const sourceSessionId = await latestSessionId(owner.userId);
    const token = await viewerToken(hostname, owner);
    expect(await getViewerSession(token, hostname)).not.toBeNull();

    expect(await signOutEverywhere(token)).toBe(true);
    expect(await getViewerSession(token, hostname)).toBeNull();
    const [source] = await db().select().from(schema.session).where(eq(schema.session.id, sourceSessionId));
    expect(source).toBeUndefined();
    expect(await signOutEverywhere(token)).toBe(false);
    expect(await signOutEverywhere("not-a-token")).toBe(false);
  });
});

// ---- Removing a domain, on purpose or by deleting its records -------------------

describe("custom domain removal", () => {
  it("stops redirecting at once when the domain row goes, whatever another process cached", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    expect((await lookupCustomHost(hostname))?.serving).toBe(true);
    expect((await getServingCustomDomain(owner.workspaceId))?.hostname).toBe(hostname);

    // Removed elsewhere (the API process): this process's caches aren't told.
    await db()
      .delete(schema.workspaceCustomDomains)
      .where(eq(schema.workspaceCustomDomains.workspaceId, owner.workspaceId));
    expect(await getServingCustomDomain(owner.workspaceId)).toBeNull();
    expect(await getServingCustomDomainForSlug(owner.workspaceSlug)).toBeNull();

    const doc = await publish(owner, { title: "After removal", visibility: "workspace" });
    expect(doc.body.publicUrl).toBe(`${openDocsWebUrl()}/${owner.workspaceSlug}/${doc.body.slug}`);
  });

  it("stops using a domain from the first check that finds its CNAME gone, and comes back when it's fixed", async () => {
    const { owner, hostname, txtValue } = await ownerWithActiveDomain();
    const doc = await publish(owner, { title: "Plan", visibility: "workspace" });
    expect(doc.body.publicUrl).toBe(`https://${hostname}/${doc.body.slug}`);

    // The owner deleted the records before removing the domain here.
    removeRecords(hostname);
    const failed = await runCustomDomainCheck(await domainRow(owner.workspaceId), "scheduled");
    expect(failed).toMatchObject({ status: "active", lastError: "target_missing", consecutiveFailures: 1 });
    clearCustomDomainCaches();

    expect(await getServingCustomDomain(owner.workspaceId)).toBeNull();
    expect((await lookupCustomHost(hostname))?.serving).toBe(false);
    const app = await getTestApp();
    const got = await request(app).get(`/api/v1/posts/${doc.body.postId}`).set(authHeaders(owner.apiKey));
    expect(got.body.post.publicUrl).toBe(`${openDocsWebUrl()}/${owner.workspaceSlug}/${doc.body.slug}`);
    const view = await request(app)
      .get("/api/v1/workspace/domain")
      .query({ workspaceId: owner.workspaceId })
      .set(authHeaders(owner.apiKey));
    expect(view.body.domain).toMatchObject({ status: "active", serving: false });

    // A missing TXT record alone doesn't stop serving: traffic still arrives.
    publishRecords(hostname, txtValue);
    const recovered = await runCustomDomainCheck(await domainRow(owner.workspaceId), "manual");
    expect(recovered).toMatchObject({ status: "active", lastError: null });
    clearCustomDomainCaches();
    expect((await getServingCustomDomain(owner.workspaceId))?.hostname).toBe(hostname);

    dns = { ...dns, txt: {} };
    await runCustomDomainCheck(await domainRow(owner.workspaceId), "scheduled");
    clearCustomDomainCaches();
    expect((await domainRow(owner.workspaceId)).lastError).toBe("txt_missing");
    expect((await getServingCustomDomain(owner.workspaceId))?.hostname).toBe(hostname);
  });
});

// ---- Hardening -------------------------------------------------------------------

describe("custom domain hardening", () => {
  it("ends old sign-ins when the hostname goes to another workspace", async () => {
    const { owner, hostname } = await ownerWithActiveDomain();
    const state = newBridgeSecret();
    const code = await createBridgeCode({
      userId: owner.userId,
      sessionId: await latestSessionId(owner.userId),
      hostname,
      state,
      returnPath: "/",
    });
    if ("error" in code) throw new Error(code.error);
    const exchanged = await exchangeBridgeCode({ code: code.code, state, hostname });
    if ("error" in exchanged) throw new Error(exchanged.error);
    expect(await getViewerSession(exchanged.token, hostname)).not.toBeNull();

    // The old row is misconfigured and someone else verifies the name.
    await db()
      .update(schema.workspaceCustomDomains)
      .set({ status: "misconfigured" })
      .where(eq(schema.workspaceCustomDomains.workspaceId, owner.workspaceId));
    const other = await createOnboardedUser();
    await db().insert(schema.workspaceCustomDomains).values({
      workspaceId: other.workspaceId,
      hostname,
      status: "active",
      verificationToken: newBridgeSecret(),
    });
    expect(await getViewerSession(exchanged.token, hostname)).toBeNull();
  });

  it("caps new hostnames per workspace per day", async () => {
    const owner = await createOnboardedUser();
    await setUserPlan(owner.userId, "pro");
    const stamp = Date.now().toString(36);
    for (let i = 0; i < 10; i++) {
      const saved = await setCustomDomainForUser(owner.userId, owner.workspaceId, `n${i}-${stamp}.acmecorp.io`);
      expect("error" in saved ? saved.error : "ok").toBe("ok");
    }
    // Saving the current name again isn't a new hostname.
    const same = await setCustomDomainForUser(owner.userId, owner.workspaceId, `n9-${stamp}.acmecorp.io`);
    expect("error" in same ? same.error : "ok").toBe("ok");
    const eleventh = await setCustomDomainForUser(owner.userId, owner.workspaceId, `n10-${stamp}.acmecorp.io`);
    expect(eleventh).toMatchObject({ error: "rate_limited" });
  });

  it("answers names that aren't active domains without a lookup per name", async () => {
    const { hostname } = await ownerWithActiveDomain();
    expect((await lookupCustomHost(hostname))?.hostname).toBe(hostname);
    expect(await lookupCustomHost(`random-${Date.now()}.example.net`)).toBeNull();
    // Activated behind this process's back: invisible until the set reloads.
    const late = await createOnboardedUser();
    const lateHost = `late-${Date.now().toString(36)}.acmecorp.io`;
    await db().insert(schema.workspaceCustomDomains).values({
      workspaceId: late.workspaceId,
      hostname: lateHost,
      status: "active",
      verificationToken: newBridgeSecret(),
    });
    expect(await lookupCustomHost(lateHost)).toBeNull();
    clearCustomDomainCaches();
    expect((await lookupCustomHost(lateHost))?.hostname).toBe(lateHost);
  });
});
