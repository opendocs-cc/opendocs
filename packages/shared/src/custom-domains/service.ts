import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";

import type { PlanTier } from "../billing/plan-limits";
import { getDbOrThrow } from "../db/guards";
import {
  posts,
  projects,
  user,
  workspaceCustomDomains,
  workspaceMembers,
  workspaces,
} from "../db/schema";
import { customDomainMisconfiguredEmail, sendEmail } from "../email";
import { postUrlPath } from "../projects/service";
import { getEffectiveWorkspaceTier } from "../workspaces/service";
import {
  checkCustomDomainDns,
  defaultResolver,
  verificationRecordName,
  verificationRecordValue,
  type CustomDomainErrorCode,
  type DnsCheckDetails,
  type DnsCheckResult,
  type DnsResolver,
  type RecordCheck,
} from "./dns";
import {
  customDomainCnameTarget,
  customDomainIpv4Addresses,
  hostnameKind,
  isLocalTestHostname,
  normalizeHostHeader,
  registrableDomain,
  validateCustomHostname,
  type HostnameKind,
} from "./hostname";
import { customDomainOrigin, customDomainUrl, isServedOnCustomDomain, openDocsWebUrl } from "./urls";
import { instanceWebUrl } from "../config/instance";

/**
 * Custom domains: a Pro or Team workspace serves its reader pages on its
 * own domain (notes.example.com). This module owns the rows in
 * `workspace_custom_domains`: creating and replacing them, DNS checks and
 * the status they drive, the lookups the web app, Caddy's `tls-ask` and
 * CORS rely on, and the absolute `publicUrl` the API hands out.
 *
 * The stored `status` is DNS only (pending → active → misconfigured and
 * back). Whether an active domain serves is decided at request time from
 * the workspace's effective plan, so a downgrade pauses it and an upgrade
 * restores it without a job.
 */

export type CustomDomainStatus = "pending" | "active" | "misconfigured";
export type CustomDomainRow = typeof workspaceCustomDomains.$inferSelect;

/** Scheduled checks in a row that may fail before an active domain stops serving. */
export const CUSTOM_DOMAIN_FAILURE_LIMIT = 3;
/** How often each domain is checked in the background. */
export const CUSTOM_DOMAIN_RECHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** How long after records check out the card says "Verifying" (first certificate). */
const VERIFYING_WINDOW_MS = 10 * 60 * 1000;
/** Lookups by host are cached this long in each process. */
const LOOKUP_CACHE_TTL_MS = 60 * 1000;
const LOOKUP_CACHE_MAX_ENTRIES = 5000;

// ---- Configuration ---------------------------------------------------------

export function customDomainConfig() {
  return {
    cnameTarget: customDomainCnameTarget(),
    ipv4: customDomainIpv4Addresses(),
    // Local testing without DNS: marks a domain active on save. Never in
    // production, whatever the variable says.
    devSkipDns:
      process.env.NODE_ENV !== "production" && process.env.CUSTOM_DOMAINS_DEV_SKIP_DNS === "1",
  };
}

let resolverOverride: DnsResolver | null = null;

/** Tests swap in a fake resolver; pass null to restore the real one. */
export function setCustomDomainResolver(resolver: DnsResolver | null) {
  resolverOverride = resolver;
}

function resolver(): DnsResolver {
  return resolverOverride ?? defaultResolver();
}

export function planAllowsCustomDomain(tier: PlanTier | null | undefined): boolean {
  return tier === "pro" || tier === "team";
}

// ---- Caches ----------------------------------------------------------------
//
// Kept on globalThis so every bundle in a process (Next's middleware and its
// route handlers, the API's two Express apps) shares one cache and saving a
// domain clears it for all of them. Bounded, because hosts come straight
// from request headers.

type CacheEntry<T> = { value: T; expiresAt: number };

const caches = globalThis as typeof globalThis & {
  __opendocsCustomHostCache?: Map<string, CacheEntry<CustomHostSite | null>>;
  __opendocsActiveHostnames?: { hosts: Set<string>; expiresAt: number; loading?: Promise<Set<string>> };
};

// Every active custom hostname, reloaded every few seconds (one small query)
// and at once when this process changes a domain. A name that isn't in it,
// which is what junk Host headers, TLS SNI names and Origins are, is
// answered from memory: a flood of made-up names can't load the database or
// push real domains out of the lookup cache.
const ACTIVE_HOSTNAMES_TTL_MS = 10 * 1000;

async function activeHostnames(): Promise<Set<string>> {
  const state = caches.__opendocsActiveHostnames;
  if (state && state.expiresAt > Date.now()) return state.hosts;
  if (state?.loading) return state.loading;
  const loading = getDbOrThrow()
    .select({ hostname: workspaceCustomDomains.hostname })
    .from(workspaceCustomDomains)
    .where(eq(workspaceCustomDomains.status, "active"))
    .then((rows) => {
      const hosts = new Set(rows.map((row) => row.hostname));
      caches.__opendocsActiveHostnames = { hosts, expiresAt: Date.now() + ACTIVE_HOSTNAMES_TTL_MS };
      return hosts;
    })
    .catch((error) => {
      caches.__opendocsActiveHostnames = state ? { hosts: state.hosts, expiresAt: 0 } : undefined;
      throw error;
    });
  caches.__opendocsActiveHostnames = { hosts: state?.hosts ?? new Set(), expiresAt: 0, loading };
  return loading;
}

function hostCache() {
  caches.__opendocsCustomHostCache ??= new Map();
  return caches.__opendocsCustomHostCache;
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): CacheEntry<T> | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry;
  if (entry) cache.delete(key);
  return undefined;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  if (cache.size >= LOOKUP_CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + LOOKUP_CACHE_TTL_MS });
}

/** Forget cached lookups, for one host or all of them. */
export function clearCustomDomainCaches(hostname?: string) {
  caches.__opendocsActiveHostnames = undefined;
  if (!hostname) {
    hostCache().clear();
    return;
  }
  hostCache().delete(hostname);
}

// ---- Lookups for serving ---------------------------------------------------

/**
 * Check results that mean the domain's traffic no longer reaches OpenDocs:
 * the CNAME is gone or points elsewhere (the owner moved the domain, or
 * deleted the records before removing it here). From the first such check
 * the domain stops being used: opendocs.cc serves the workspace again
 * instead of redirecting to a dead address, links go back to opendocs.cc,
 * and the sign-in bridge refuses it. Three in a row still make it
 * misconfigured (and email the owner); a passing check brings it back.
 */
const ROUTING_FAILURES: ReadonlySet<string> = new Set(["target_missing", "target_mismatch"]);

export function isRoutingFailure(code: string | null | undefined): boolean {
  return Boolean(code && ROUTING_FAILURES.has(code));
}

export type CustomHostSite = {
  domainId: string;
  hostname: string;
  origin: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  logoUrl: string | null;
  /** Show "Published with OpenDocs" in the footer (white-label when false). */
  showPoweredBy: boolean;
  /** True when the workspace's plan includes custom domains. */
  serving: boolean;
  /** Active DNS but the plan doesn't include custom domains (downgraded). */
  paused: boolean;
};

export type ServingDomain = { domainId: string; hostname: string; origin: string };

async function loadCustomHost(hostname: string): Promise<CustomHostSite | null> {
  const [row] = await getDbOrThrow()
    .select({
      domainId: workspaceCustomDomains.id,
      hostname: workspaceCustomDomains.hostname,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      workspaceName: workspaces.name,
      logoUrl: workspaces.logoUrl,
      showPoweredBy: workspaceCustomDomains.showPoweredBy,
      lastError: workspaceCustomDomains.lastError,
    })
    .from(workspaceCustomDomains)
    .innerJoin(workspaces, eq(workspaces.id, workspaceCustomDomains.workspaceId))
    .where(
      and(eq(workspaceCustomDomains.hostname, hostname), eq(workspaceCustomDomains.status, "active")),
    )
    .limit(1);
  if (!row) return null;
  const { lastError, ...site } = row;
  const planAllowed = planAllowsCustomDomain(await getEffectiveWorkspaceTier(row.workspaceId));
  return {
    ...site,
    logoUrl: site.logoUrl ?? null,
    origin: customDomainOrigin(site.hostname),
    serving: planAllowed && !isRoutingFailure(lastError),
    paused: !planAllowed,
  };
}

/**
 * The workspace behind a custom host, or null when the host isn't an
 * active custom domain (unknown, still pending, or misconfigured). Names
 * that aren't active are answered from the in-memory set (no query); the
 * rest are cached for a minute. `fresh` skips both for security decisions
 * that must see a removal at once (the sign-in bridge, which is rate
 * limited).
 */
export async function lookupCustomHost(
  rawHostname: string,
  options: { fresh?: boolean } = {},
): Promise<CustomHostSite | null> {
  const hostname = normalizeHostHeader(rawHostname);
  if (!hostname || hostname.length > 253) return null;
  if (!options.fresh) {
    if (!(await activeHostnames()).has(hostname)) return null;
    const cached = readCache(hostCache(), hostname);
    if (cached) return cached.value;
  }
  const site = await loadCustomHost(hostname);
  writeCache(hostCache(), hostname, site);
  return site;
}

/**
 * Caddy's on-demand TLS `ask`: a certificate may be issued only for a
 * hostname that is verified (active) and on a Pro or Team workspace.
 */
export async function isTlsAllowedForHostname(rawHostname: string): Promise<boolean> {
  const site = await lookupCustomHost(rawHostname);
  return Boolean(site?.serving);
}

/**
 * The domain a workspace's pages are served on right now, if any: what
 * opendocs.cc redirects to and the dashboard links to. The domain row is
 * read fresh every time (one indexed query), so removing a domain, or a
 * check that finds its record gone, takes effect at once in every process,
 * not after the lookup cache expires; only the plan check is cached.
 */
export async function getServingCustomDomain(workspaceId: string): Promise<ServingDomain | null> {
  const [row] = await getDbOrThrow()
    .select({ hostname: workspaceCustomDomains.hostname, lastError: workspaceCustomDomains.lastError })
    .from(workspaceCustomDomains)
    .where(
      and(
        eq(workspaceCustomDomains.workspaceId, workspaceId),
        eq(workspaceCustomDomains.status, "active"),
      ),
    )
    .limit(1);
  if (!row || isRoutingFailure(row.lastError)) return null;
  const site = await lookupCustomHost(row.hostname);
  return site && !site.paused ? { domainId: site.domainId, hostname: site.hostname, origin: site.origin } : null;
}

/**
 * getServingCustomDomain by workspace slug, for opendocs.cc reader pages:
 * they redirect to the domain before working out who may see what (a
 * private workspace tells non-members nothing, not even its id).
 */
export async function getServingCustomDomainForSlug(workspaceSlug: string): Promise<ServingDomain | null> {
  const [row] = await getDbOrThrow()
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug.toLowerCase()))
    .limit(1);
  return row ? getServingCustomDomain(row.id) : null;
}

/**
 * Whether an Origin header (https://notes.example.com) is a custom domain
 * that serves right now. The API's CORS uses it for the public endpoints
 * reader pages call.
 */
export async function isServingCustomOrigin(origin: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.pathname !== "/" || url.username || url.password) return false;
  const site = await lookupCustomHost(url.hostname);
  return Boolean(site?.serving && site.origin === url.origin);
}

// ---- publicUrl ---------------------------------------------------------------

export type PostLinks = {
  /** Relative opendocs.cc path, e.g. /acme/plan (the API's `url`). */
  url: string;
  /** Absolute link to hand out (the API's `publicUrl`). */
  publicUrl: string;
};

/**
 * Links for posts, keyed by post id. `publicUrl` is the custom-domain URL
 * when the workspace's domain is active and not paused and the post is
 * published, whatever its visibility: the workspace's reader pages all live
 * on its domain (opendocs.cc redirects there, and readers of private
 * documents sign in through the bridge). Otherwise, and for documents whose
 * slug is an app path, the opendocs.cc URL. Missing posts are left out.
 */
export async function getPostLinks(postIds: string[]): Promise<Map<string, PostLinks>> {
  const ids = [...new Set(postIds.filter(Boolean))];
  const result = new Map<string, PostLinks>();
  if (ids.length === 0) return result;

  const rows = await getDbOrThrow()
    .select({
      id: posts.id,
      slug: posts.slug,
      isPublished: posts.isPublished,
      workspaceId: workspaces.id,
      workspaceSlug: workspaces.slug,
      projectSlug: projects.slug,
      isDefaultProject: projects.isDefault,
      hostname: workspaceCustomDomains.hostname,
      domainLastError: workspaceCustomDomains.lastError,
    })
    .from(posts)
    .innerJoin(workspaces, eq(workspaces.id, posts.workspaceId))
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .leftJoin(
      workspaceCustomDomains,
      and(
        eq(workspaceCustomDomains.workspaceId, posts.workspaceId),
        eq(workspaceCustomDomains.status, "active"),
      ),
    )
    .where(inArray(posts.id, ids));

  const base = openDocsWebUrl();
  const servingByWorkspace = new Map<string, boolean>();
  for (const row of rows) {
    const url = postUrlPath(
      row.workspaceSlug,
      { slug: row.projectSlug, isDefault: row.isDefaultProject },
      row.slug,
    );
    if (
      row.hostname &&
      row.isPublished &&
      !isRoutingFailure(row.domainLastError) &&
      isServedOnCustomDomain(row.workspaceSlug, url)
    ) {
      if (!servingByWorkspace.has(row.workspaceId)) {
        servingByWorkspace.set(
          row.workspaceId,
          planAllowsCustomDomain(await getEffectiveWorkspaceTier(row.workspaceId)),
        );
      }
      if (servingByWorkspace.get(row.workspaceId)) {
        result.set(row.id, { url, publicUrl: customDomainUrl(row.hostname, row.workspaceSlug, url) });
        continue;
      }
    }
    result.set(row.id, { url, publicUrl: `${base}${url}` });
  }
  return result;
}

export async function getPublicUrlForPost(postId: string): Promise<string | null> {
  return (await getPostLinks([postId])).get(postId)?.publicUrl ?? null;
}

// ---- What the dashboard and the API show -------------------------------------

export type CustomDomainState = "pending" | "verifying" | "active" | "misconfigured" | "paused";

export type CustomDomainRecord = {
  type: "CNAME" | "A" | "TXT";
  /** Full name, e.g. notes.example.com or _opendocs.notes.example.com. */
  name: string;
  /** The same name relative to the domain, which some DNS providers ask for ("notes"). */
  host: string;
  value: string;
  purpose: "routing" | "verification";
  /** Outcome of the last check for this record, null before the first check. */
  check: RecordCheck | null;
};

export type CustomDomainView = {
  id: string;
  workspaceId: string;
  hostname: string;
  kind: HostnameKind;
  /** DNS status as stored. */
  status: CustomDomainStatus;
  /** What the dashboard shows: DNS status combined with the plan. */
  state: CustomDomainState;
  /** True when the domain serves the workspace's pages right now. */
  serving: boolean;
  url: string;
  records: CustomDomainRecord[];
  lastError: { code: CustomDomainErrorCode; message: string } | null;
  consecutiveFailures: number;
  verifiedAt: string | null;
  lastCheckedAt: string | null;
  failingSince: string | null;
  /** Show "Published with OpenDocs" in the domain's footer. */
  showPoweredBy: boolean;
  createdAt: string;
};

function relativeHost(name: string, zone: string) {
  if (name === zone) return "@";
  return name.endsWith(`.${zone}`) ? name.slice(0, -(zone.length + 1)) : name;
}

function routingExpectation(kind: HostnameKind, config = customDomainConfig()) {
  return kind === "apex" ? config.ipv4.join(", ") : config.cnameTarget;
}

/** Plain-language explanation of a failed check, naming the record. */
export function describeCustomDomainError(
  code: CustomDomainErrorCode,
  row: Pick<CustomDomainRow, "hostname"> & { lastCheck?: unknown },
): string {
  const hostname = row.hostname;
  const kind = hostnameKind(hostname);
  const txtName = verificationRecordName(hostname);
  const expected = routingExpectation(kind);
  const found = ((row.lastCheck as DnsCheckDetails | null | undefined)?.targetFound ?? []).join(", ");
  switch (code) {
    case "target_missing":
      return kind === "apex"
        ? `No A record found for ${hostname}. Add one pointing to ${expected}.`
        : `No CNAME record found for ${hostname}. Add one pointing to ${expected}.`;
    case "target_mismatch":
      return found
        ? `${hostname} points to ${found}, not ${expected}. Change the record, and remove any other A or AAAA records for this name.`
        : `${hostname} doesn't point to ${expected}.`;
    case "cloudflare_proxied":
      return `${hostname} is proxied by Cloudflare. Set the record to DNS only (grey cloud) so OpenDocs can issue its certificate.`;
    case "ipv6_mismatch":
      return `${hostname} has AAAA (IPv6) records that don't point to OpenDocs. Remove them.`;
    case "txt_missing":
      return `No TXT record found at ${txtName}.`;
    case "txt_mismatch":
      return `The TXT record at ${txtName} has a different verification value. Use the value shown here.`;
    case "txt_conflict":
      return `The TXT record at ${txtName} still has another workspace's verification value. Remove that value to connect the domain here.`;
    case "dns_error":
      return `We couldn't look up ${hostname} just now. We'll try again shortly.`;
    case "domain_taken":
      return `${hostname} is connected to another OpenDocs workspace.`;
  }
}

function toView(row: CustomDomainRow, tier: PlanTier | null): CustomDomainView {
  const config = customDomainConfig();
  const kind = hostnameKind(row.hostname);
  const allowed = planAllowsCustomDomain(tier);
  const details = row.lastCheck as DnsCheckDetails | null;
  const zone = isLocalTestHostname(row.hostname) ? "localhost" : registrableDomain(row.hostname);
  const routingRecords: CustomDomainRecord[] =
    kind === "apex"
      ? config.ipv4.map((ip) => ({
          type: "A" as const,
          name: row.hostname,
          host: relativeHost(row.hostname, zone),
          value: ip,
          purpose: "routing" as const,
          check: details?.target ?? null,
        }))
      : [
          {
            type: "CNAME",
            name: row.hostname,
            host: relativeHost(row.hostname, zone),
            value: config.cnameTarget,
            purpose: "routing",
            check: details?.target ?? null,
          },
        ];
  const txtName = verificationRecordName(row.hostname);

  let state: CustomDomainState;
  if (!allowed) state = "paused";
  else if (row.status === "misconfigured") state = "misconfigured";
  else if (row.status === "pending") state = "pending";
  else if (row.verifiedAt && Date.now() - row.verifiedAt.getTime() < VERIFYING_WINDOW_MS) state = "verifying";
  else state = "active";

  const lastError = (row.lastError as CustomDomainErrorCode | null) ?? null;
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    hostname: row.hostname,
    kind,
    status: row.status,
    state,
    serving: allowed && row.status === "active" && !isRoutingFailure(row.lastError),
    url: customDomainOrigin(row.hostname),
    records: [
      ...routingRecords,
      {
        type: "TXT",
        name: txtName,
        host: relativeHost(txtName, zone),
        value: verificationRecordValue(row.verificationToken),
        purpose: "verification",
        check: details?.txt ?? null,
      },
    ],
    lastError: lastError ? { code: lastError, message: describeCustomDomainError(lastError, row) } : null,
    consecutiveFailures: row.consecutiveFailures,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    failingSince: row.failingSince?.toISOString() ?? null,
    showPoweredBy: row.showPoweredBy,
    createdAt: row.createdAt.toISOString(),
  };
}

// ---- Managing a workspace's domain (API) -------------------------------------

export type CustomDomainError =
  | { error: "not_found" }
  | { error: "forbidden"; message: string }
  | { error: "plan_required"; tier: PlanTier; message: string }
  | { error: "invalid_hostname"; reason: string; message: string }
  | { error: "domain_taken"; message: string }
  | { error: "rate_limited"; message: string };

// New hostnames per day, per workspace and per person. Every verified name
// gets a Let's Encrypt certificate on its first visit, and the account's
// order limit is shared by every customer: cycling through freshly
// verified names must not be able to use it up. In memory: the API runs as
// one process, and a restart only resets the count.
const NEW_HOSTNAMES_PER_DAY = { workspace: 10, user: 20 };
const DAY_MS = 24 * 60 * 60 * 1000;
const hostnameChanges = new Map<string, number[]>();

function allowNewHostname(userId: string, workspaceId: string): boolean {
  const now = Date.now();
  const keys = [
    { key: `workspace:${workspaceId}`, limit: NEW_HOSTNAMES_PER_DAY.workspace },
    { key: `user:${userId}`, limit: NEW_HOSTNAMES_PER_DAY.user },
  ];
  const recent = keys.map(({ key }) => (hostnameChanges.get(key) ?? []).filter((at) => now - at < DAY_MS));
  if (recent.some((times, index) => times.length >= keys[index].limit)) return false;
  keys.forEach(({ key }, index) => hostnameChanges.set(key, [...recent[index], now]));
  if (hostnameChanges.size > 10_000) hostnameChanges.delete(hostnameChanges.keys().next().value!);
  return true;
}

async function getRole(userId: string, workspaceId: string) {
  const [membership] = await getDbOrThrow()
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.userId, userId),
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.status, "active"),
      ),
    )
    .limit(1);
  return membership?.role ?? null;
}

async function getDomainRow(workspaceId: string) {
  const [row] = await getDbOrThrow()
    .select()
    .from(workspaceCustomDomains)
    .where(eq(workspaceCustomDomains.workspaceId, workspaceId))
    .limit(1);
  return row ?? null;
}

const FORBIDDEN_MESSAGE = "Only workspace owners and admins can manage the custom domain.";

function planRequired(tier: PlanTier | null): CustomDomainError {
  return {
    error: "plan_required",
    tier: tier ?? "free",
    message:
      `Custom domains are part of the Pro and Team plans. Upgrade at ${instanceWebUrl()}/dashboard/billing.`,
  };
}

export type CustomDomainPlan = { tier: PlanTier; allowed: boolean };

/** Members can read the domain and its records; it's no secret to them. */
export async function getCustomDomainForUser(
  userId: string,
  workspaceId: string,
): Promise<CustomDomainError | { domain: CustomDomainView | null; plan: CustomDomainPlan }> {
  if (!(await getRole(userId, workspaceId))) return { error: "not_found" };
  const tier = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  const row = await getDomainRow(workspaceId);
  return {
    domain: row ? toView(row, tier) : null,
    plan: { tier, allowed: planAllowsCustomDomain(tier) },
  };
}

function newVerificationToken() {
  return randomBytes(18).toString("base64url");
}

/**
 * Connect a domain, or replace the workspace's current one. Saving the
 * same hostname again keeps its token (so DNS stays valid) and re-checks.
 * A new hostname gets a fresh token and starts pending; sign-ins on the
 * old one end with the old row.
 */
export async function setCustomDomainForUser(
  userId: string,
  workspaceId: string,
  rawHostname: string,
): Promise<CustomDomainError | { domain: CustomDomainView; plan: CustomDomainPlan }> {
  const role = await getRole(userId, workspaceId);
  if (!role) return { error: "not_found" };
  if (role === "member") return { error: "forbidden", message: FORBIDDEN_MESSAGE };
  const tier = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  if (!planAllowsCustomDomain(tier)) return planRequired(tier);

  const validation = validateCustomHostname(rawHostname);
  if (!validation.ok) {
    return { error: "invalid_hostname", reason: validation.reason, message: validation.message };
  }
  const { hostname, kind } = validation;
  if (kind === "apex" && customDomainConfig().ipv4.length === 0) {
    return {
      error: "invalid_hostname",
      reason: "apex_unsupported",
      message: `Use a subdomain such as notes.${hostname}. OpenDocs connects subdomains, with a CNAME record; root domains aren't supported.`,
    };
  }

  const database = getDbOrThrow();
  const [takenElsewhere] = await database
    .select({ id: workspaceCustomDomains.id })
    .from(workspaceCustomDomains)
    .where(
      and(
        eq(workspaceCustomDomains.hostname, hostname),
        eq(workspaceCustomDomains.status, "active"),
        ne(workspaceCustomDomains.workspaceId, workspaceId),
      ),
    )
    .limit(1);
  if (takenElsewhere) {
    return { error: "domain_taken", message: `${hostname} is connected to another OpenDocs workspace.` };
  }

  let row: CustomDomainRow | null = await getDomainRow(workspaceId);
  if ((!row || row.hostname !== hostname) && !allowNewHostname(userId, workspaceId)) {
    return {
      error: "rate_limited",
      message: "This workspace has connected too many new domains today. Try again tomorrow.",
    };
  }
  if (!row || row.hostname !== hostname) {
    // New, or replacing the domain: drop the old row (and with it any
    // sign-ins on the old host) and insert the new one in one transaction,
    // so a failed insert leaves the old domain in place.
    const previous = row;
    const inserted = await database.transaction(async (tx) => {
      if (previous) {
        await tx.delete(workspaceCustomDomains).where(eq(workspaceCustomDomains.id, previous.id));
      }
      return tx
        .insert(workspaceCustomDomains)
        .values({
          workspaceId,
          hostname,
          verificationToken: newVerificationToken(),
          createdByUserId: userId,
        })
        .onConflictDoNothing()
        .returning();
    });
    if (previous) clearCustomDomainCaches(previous.hostname);
    row = inserted[0] ?? (await getDomainRow(workspaceId));
    if (!row) throw new Error("Could not save the custom domain.");
  }

  // Check straight away: if the records are already in place, the card
  // goes green without waiting for the background check.
  if (row.status !== "active") row = await runCustomDomainCheck(row, "manual");
  return { domain: toView(row, tier), plan: { tier, allowed: true } };
}

export async function removeCustomDomainForUser(
  userId: string,
  workspaceId: string,
): Promise<CustomDomainError | { removed: boolean; hostname: string | null }> {
  const role = await getRole(userId, workspaceId);
  if (!role) return { error: "not_found" };
  if (role === "member") return { error: "forbidden", message: FORBIDDEN_MESSAGE };
  const row = await getDomainRow(workspaceId);
  if (!row) return { removed: false, hostname: null };
  await getDbOrThrow().delete(workspaceCustomDomains).where(eq(workspaceCustomDomains.id, row.id));
  clearCustomDomainCaches(row.hostname);
  return { removed: true, hostname: row.hostname };
}

/**
 * Domain display settings: for now whether the footer says "Published with
 * OpenDocs". Owners and admins, on a plan with custom domains.
 */
export async function updateCustomDomainSettingsForUser(
  userId: string,
  workspaceId: string,
  settings: { showPoweredBy: boolean },
): Promise<CustomDomainError | { domain: CustomDomainView; plan: CustomDomainPlan }> {
  const role = await getRole(userId, workspaceId);
  if (!role) return { error: "not_found" };
  if (role === "member") return { error: "forbidden", message: FORBIDDEN_MESSAGE };
  const tier = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  if (!planAllowsCustomDomain(tier)) return planRequired(tier);
  const row = await getDomainRow(workspaceId);
  if (!row) return { error: "not_found" };
  const [updated] = await getDbOrThrow()
    .update(workspaceCustomDomains)
    .set({ showPoweredBy: settings.showPoweredBy, updatedAt: new Date() })
    .where(eq(workspaceCustomDomains.id, row.id))
    .returning();
  clearCustomDomainCaches(row.hostname);
  return { domain: toView(updated ?? row, tier), plan: { tier, allowed: true } };
}

/** "Check now": re-runs the DNS check for the workspace's domain. */
export async function checkCustomDomainForUser(
  userId: string,
  workspaceId: string,
): Promise<CustomDomainError | { domain: CustomDomainView | null; plan: CustomDomainPlan }> {
  const role = await getRole(userId, workspaceId);
  if (!role) return { error: "not_found" };
  if (role === "member") return { error: "forbidden", message: FORBIDDEN_MESSAGE };
  const tier = (await getEffectiveWorkspaceTier(workspaceId)) ?? "free";
  const row = await getDomainRow(workspaceId);
  if (!row) return { domain: null, plan: { tier, allowed: planAllowsCustomDomain(tier) } };
  const checked = await runCustomDomainCheck(row, "manual");
  return { domain: toView(checked, tier), plan: { tier, allowed: planAllowsCustomDomain(tier) } };
}

// ---- Checks --------------------------------------------------------------------

const PASSED_DETAILS: DnsCheckDetails = { txt: "ok", target: "ok", targetFound: [], matchedBy: null };

function isUniqueViolation(error: unknown) {
  const code =
    (error as { code?: string })?.code ?? (error as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
}

export type CheckSource = "manual" | "scheduled";

/**
 * Checks one domain's records and moves its status:
 *
 *   - records in place: active (from pending, or back from misconfigured);
 *   - pending and not yet in place: stays pending;
 *   - active and failing: a scheduled check counts toward the limit, and
 *     the limit-th failure in a row makes it misconfigured, which stops it
 *     serving and emails the owner. Manual checks and inconclusive lookups
 *     (DNS timeouts) report the problem without counting it, so a few
 *     clicks on "Check now" during propagation can't take a domain down.
 */
export async function runCustomDomainCheck(
  row: CustomDomainRow,
  source: CheckSource,
): Promise<CustomDomainRow> {
  const database = getDbOrThrow();
  const now = new Date();
  const others = await database
    .select({
      status: workspaceCustomDomains.status,
      verificationToken: workspaceCustomDomains.verificationToken,
    })
    .from(workspaceCustomDomains)
    .where(and(eq(workspaceCustomDomains.hostname, row.hostname), ne(workspaceCustomDomains.id, row.id)));

  const config = customDomainConfig();
  let result: DnsCheckResult;
  if (others.some((other) => other.status === "active")) {
    // Not looked up: the name is someone else's until they let it go.
    result = {
      ok: false,
      code: "domain_taken",
      details: { txt: "conflict", target: "error", targetFound: [], matchedBy: null },
    };
  } else if (config.devSkipDns) {
    result = { ok: true, details: PASSED_DETAILS };
  } else {
    result = await checkCustomDomainDns(
      row.hostname,
      row.verificationToken,
      config,
      resolver(),
      others.map((other) => other.verificationToken),
    );
  }

  const update: Partial<typeof workspaceCustomDomains.$inferInsert> = {
    lastCheckedAt: now,
    lastCheck: result.details as unknown as Record<string, unknown>,
    updatedAt: now,
  };
  let transition: "activated" | "recovered" | "misconfigured" | null = null;

  if (result.ok) {
    update.status = "active";
    update.lastError = null;
    update.consecutiveFailures = 0;
    update.failingSince = null;
    if (row.status !== "active") {
      update.verifiedAt = now;
      transition = row.status === "pending" ? "activated" : "recovered";
    }
  } else {
    update.lastError = result.code;
    const counts = source === "scheduled" && result.code !== "dns_error";
    if (row.status === "active" && counts) {
      const failures = row.consecutiveFailures + 1;
      update.consecutiveFailures = failures;
      update.failingSince = row.failingSince ?? now;
      if (failures >= CUSTOM_DOMAIN_FAILURE_LIMIT) {
        update.status = "misconfigured";
        transition = "misconfigured";
      }
    } else if (row.status === "misconfigured" && counts) {
      update.consecutiveFailures = row.consecutiveFailures + 1;
    }
  }

  let updated: CustomDomainRow;
  try {
    [updated] = await database
      .update(workspaceCustomDomains)
      .set(update)
      .where(eq(workspaceCustomDomains.id, row.id))
      .returning();
  } catch (error) {
    // Another workspace went active on the same name between our read and
    // this write; the partial unique index keeps only one of them.
    if (!isUniqueViolation(error) || update.status !== "active") throw error;
    [updated] = await database
      .update(workspaceCustomDomains)
      .set({
        lastCheckedAt: now,
        lastError: "domain_taken",
        updatedAt: now,
        status: row.status,
      })
      .where(eq(workspaceCustomDomains.id, row.id))
      .returning();
    transition = null;
  }
  if (!updated) return row;

  if (transition || row.status !== updated.status) clearCustomDomainCaches(row.hostname);
  // No email when the plan had already paused the domain: it wasn't
  // serving, so nothing "stopped working".
  if (
    transition === "misconfigured" &&
    planAllowsCustomDomain(await getEffectiveWorkspaceTier(updated.workspaceId))
  ) {
    await notifyOwnerMisconfigured(updated).catch((error) => {
      console.error("[custom-domains] Failed to email the workspace owner:", error);
    });
  }
  return updated;
}

async function notifyOwnerMisconfigured(row: CustomDomainRow) {
  const [owner] = await getDbOrThrow()
    .select({ email: user.email, workspaceName: workspaces.name })
    .from(workspaces)
    .innerJoin(user, eq(user.id, workspaces.ownerUserId))
    .where(eq(workspaces.id, row.workspaceId))
    .limit(1);
  if (!owner) return;
  const code = (row.lastError as CustomDomainErrorCode | null) ?? "target_missing";
  await sendEmail({
    to: owner.email,
    subject: `${row.hostname} stopped working on OpenDocs`,
    html: customDomainMisconfiguredEmail({
      hostname: row.hostname,
      workspaceName: owner.workspaceName,
      reason: describeCustomDomainError(code, row),
      settingsUrl: `${openDocsWebUrl()}/dashboard/workspace#custom-domain`,
    }),
  });
}

/**
 * The background check: every domain whose last check is older than the
 * recheck interval, oldest first. Run on a timer in the API process (one
 * instance), so a restart never resets the schedule.
 */
export async function recheckDueCustomDomains(options: { limit?: number; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const dueBefore = new Date(now.getTime() - CUSTOM_DOMAIN_RECHECK_INTERVAL_MS);
  const due = await getDbOrThrow()
    .select()
    .from(workspaceCustomDomains)
    .where(
      or(isNull(workspaceCustomDomains.lastCheckedAt), lt(workspaceCustomDomains.lastCheckedAt, dueBefore)),
    )
    .orderBy(sql`${workspaceCustomDomains.lastCheckedAt} asc nulls first`, asc(workspaceCustomDomains.createdAt))
    .limit(options.limit ?? 50);

  const summary = { checked: 0, activated: 0, recovered: 0, misconfigured: 0 };
  for (const listed of due) {
    try {
      // Re-read first: a batch can take minutes (each check is a few DNS
      // lookups), and "Check now", a hostname change or a removal may have
      // happened since the list was read. Counting a failure on top of a
      // stale row could take down a domain its owner just fixed.
      const [row] = await getDbOrThrow()
        .select()
        .from(workspaceCustomDomains)
        .where(eq(workspaceCustomDomains.id, listed.id))
        .limit(1);
      if (!row || (row.lastCheckedAt && row.lastCheckedAt >= dueBefore)) continue;
      const updated = await runCustomDomainCheck(row, "scheduled");
      summary.checked += 1;
      if (row.status === "pending" && updated.status === "active") summary.activated += 1;
      if (row.status === "misconfigured" && updated.status === "active") summary.recovered += 1;
      if (row.status !== "misconfigured" && updated.status === "misconfigured") summary.misconfigured += 1;
    } catch (error) {
      console.error(`[custom-domains] Check failed for ${listed.hostname}:`, error);
    }
  }
  return summary;
}

// ---- Sitemaps ------------------------------------------------------------------

/**
 * Everything a custom domain's /sitemap.xml lists: the workspace's public,
 * published documents and the projects that have any, as opendocs.cc
 * paths (the caller maps them to the domain). Empty when the workspace
 * doesn't allow public documents.
 */
export async function listPublicWorkspacePaths(workspaceId: string) {
  const database = getDbOrThrow();
  const [workspace] = await database
    .select({ slug: workspaces.slug, allowPublicDocuments: workspaces.allowPublicDocuments })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (!workspace?.allowPublicDocuments) return { workspaceSlug: workspace?.slug ?? null, documents: [], projects: [] };

  const rows = await database
    .select({
      slug: posts.slug,
      updatedAt: posts.updatedAt,
      projectSlug: projects.slug,
      isDefaultProject: projects.isDefault,
    })
    .from(posts)
    .innerJoin(projects, eq(projects.id, posts.projectId))
    .where(
      and(eq(posts.workspaceId, workspaceId), eq(posts.isPublished, true), eq(posts.visibility, "public")),
    )
    .orderBy(sql`${posts.updatedAt} desc`)
    .limit(5000);

  const projectUpdated = new Map<string, Date>();
  for (const row of rows) {
    if (row.isDefaultProject) continue;
    const latest = projectUpdated.get(row.projectSlug);
    if (!latest || row.updatedAt > latest) projectUpdated.set(row.projectSlug, row.updatedAt);
  }
  return {
    workspaceSlug: workspace.slug,
    documents: rows
      .map((row) => ({
        path: postUrlPath(workspace.slug, { slug: row.projectSlug, isDefault: row.isDefaultProject }, row.slug),
        updatedAt: row.updatedAt,
      }))
      .filter((doc) => isServedOnCustomDomain(workspace.slug, doc.path)),
    projects: [...projectUpdated].map(([slug, updatedAt]) => ({
      path: `/${workspace.slug}/projects/${slug}`,
      updatedAt,
    })),
  };
}
