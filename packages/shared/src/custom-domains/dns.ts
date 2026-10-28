import { Resolver } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * DNS verification for custom domains. A domain checks out when
 *
 *   1. the TXT record at `_opendocs.<hostname>` contains
 *      `opendocs-verify=<token>` (proves the workspace controls the name),
 *      and no other workspace's verification value for the same name, and
 *   2. the name sends traffic to us: a CNAME to the target
 *      (custom.opendocs.cc), or A records that resolve to our addresses.
 *      Resolving A records also covers CNAME chains and CNAME flattening.
 *
 * Lookups go to public resolvers (1.1.1.1, 8.8.8.8), not the server's own
 * cache, so a change the customer just made is seen as the world sees it.
 * The resolver is injected so tests can fake every answer.
 */

export type DnsResolver = {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolve4(name: string): Promise<string[]>;
  resolve6(name: string): Promise<string[]>;
};

export const VERIFY_PREFIX = "opendocs-verify=";

export function verificationRecordName(hostname: string) {
  return `_opendocs.${hostname}`;
}

export function verificationRecordValue(token: string) {
  return `${VERIFY_PREFIX}${token}`;
}

export type CustomDomainErrorCode =
  | "txt_missing"
  | "txt_mismatch"
  | "txt_conflict"
  | "target_missing"
  | "target_mismatch"
  | "cloudflare_proxied"
  | "ipv6_mismatch"
  | "dns_error"
  | "domain_taken";

export type RecordCheck = "ok" | "missing" | "mismatch" | "conflict" | "proxied" | "error";

export type DnsCheckDetails = {
  txt: RecordCheck;
  target: RecordCheck;
  /** What the name pointed at: CNAME targets or IP addresses. */
  targetFound: string[];
  /** Whether the target matched through a CNAME or A records. */
  matchedBy: "cname" | "a" | null;
};

export type DnsCheckResult =
  | { ok: true; details: DnsCheckDetails }
  | { ok: false; code: CustomDomainErrorCode; details: DnsCheckDetails };

export type DnsCheckConfig = {
  cnameTarget: string;
  ipv4: string[];
  ipv6?: string[];
};

let sharedResolver: DnsResolver | null = null;

/** Node's resolver pointed at Cloudflare and Google, with short timeouts. */
export function createPublicResolver(): DnsResolver {
  const resolver = new Resolver({ timeout: 3000, tries: 2 });
  resolver.setServers(["1.1.1.1", "8.8.8.8"]);
  return {
    resolveTxt: (name) => resolver.resolveTxt(name),
    resolveCname: (name) => resolver.resolveCname(name),
    resolve4: (name) => resolver.resolve4(name),
    resolve6: (name) => resolver.resolve6(name),
  };
}

export function defaultResolver(): DnsResolver {
  if (!sharedResolver) sharedResolver = createPublicResolver();
  return sharedResolver;
}

// "No such name" and "no records of this type" are answers, not failures.
const NO_DATA_CODES = new Set(["ENOTFOUND", "ENODATA", "ENONAME", "NXDOMAIN", "ENOTIMP"]);

type Lookup<T> = { ok: true; value: T } | { ok: false; noData: boolean };

async function lookup<T>(run: () => Promise<T>): Promise<Lookup<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    return { ok: false, noData: NO_DATA_CODES.has(code) };
  }
}

function normalizeName(name: string) {
  return name.trim().toLowerCase().replace(/\.$/, "");
}

// Cloudflare's published proxy ranges (https://www.cloudflare.com/ips-v4).
// An A record inside them means the record is proxied (orange cloud), so
// Cloudflare, not us, answers TLS and our certificate can't be issued.
const CLOUDFLARE_IPV4_RANGES: Array<[string, number]> = [
  ["173.245.48.0", 20], ["103.21.244.0", 22], ["103.22.200.0", 22], ["103.31.4.0", 22],
  ["141.101.64.0", 18], ["108.162.192.0", 18], ["190.93.240.0", 20], ["188.114.96.0", 20],
  ["197.234.240.0", 22], ["198.41.128.0", 17], ["162.158.0.0", 15], ["104.16.0.0", 13],
  ["104.24.0.0", 14], ["172.64.0.0", 13], ["131.0.72.0", 22],
];

function ipv4ToInt(ip: string) {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

export function isCloudflareIpv4(ip: string): boolean {
  if (isIP(ip) !== 4) return false;
  const value = ipv4ToInt(ip);
  return CLOUDFLARE_IPV4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4ToInt(base) & mask);
  });
}

/** The TXT values at a name, with multi-string records joined. */
function txtValues(records: string[][]) {
  return records.map((chunks) => chunks.join("").trim());
}

/**
 * Checks the two records for one hostname. `otherTokens` are the
 * verification tokens of other workspaces that are trying to claim the
 * same name: while one of them is still published, nobody else can take
 * the name over.
 */
export async function checkCustomDomainDns(
  hostname: string,
  token: string,
  config: DnsCheckConfig,
  resolver: DnsResolver,
  otherTokens: string[] = [],
): Promise<DnsCheckResult> {
  const name = normalizeName(hostname);
  const target = normalizeName(config.cnameTarget);
  const ourIpv4 = new Set(config.ipv4);
  const ourIpv6 = new Set(config.ipv6 ?? []);

  const [txt, cname, a, aaaa] = await Promise.all([
    lookup(() => resolver.resolveTxt(verificationRecordName(name))),
    lookup(() => resolver.resolveCname(name)),
    lookup(() => resolver.resolve4(name)),
    lookup(() => resolver.resolve6(name)),
  ]);

  // TXT
  let txtCheck: RecordCheck;
  if (!txt.ok) {
    txtCheck = txt.noData ? "missing" : "error";
  } else {
    const values = txtValues(txt.value);
    const ours = values.includes(verificationRecordValue(token));
    const theirs = otherTokens.some((other) => values.includes(verificationRecordValue(other)));
    if (ours && theirs) txtCheck = "conflict";
    else if (ours) txtCheck = "ok";
    else if (values.some((value) => value.startsWith(VERIFY_PREFIX))) txtCheck = "mismatch";
    else txtCheck = "missing";
  }

  // Target
  const cnames = cname.ok ? cname.value.map(normalizeName) : [];
  const addresses = a.ok ? a.value : [];
  const ipv6Addresses = aaaa.ok ? aaaa.value : [];
  let targetCheck: RecordCheck;
  let matchedBy: DnsCheckDetails["matchedBy"] = null;
  if (cnames.includes(target)) {
    targetCheck = "ok";
    matchedBy = "cname";
  } else if (addresses.length > 0 && addresses.some((ip) => ourIpv4.has(ip))) {
    // Every address must be ours: a leftover A record to an old host
    // would send some visitors elsewhere.
    targetCheck = addresses.every((ip) => ourIpv4.has(ip)) ? "ok" : "mismatch";
    matchedBy = targetCheck === "ok" ? "a" : null;
  } else if (addresses.length > 0 && addresses.every(isCloudflareIpv4)) {
    targetCheck = "proxied";
  } else if (cnames.length > 0 || addresses.length > 0) {
    targetCheck = "mismatch";
  } else if ((!cname.ok && !cname.noData) || (!a.ok && !a.noData)) {
    targetCheck = "error";
  } else {
    targetCheck = "missing";
  }

  // AAAA records that aren't ours send IPv6 visitors somewhere else. With
  // a CNAME to our target they can't exist (unless the target has them),
  // so this only bites A-record setups with a stale AAAA record.
  const strayIpv6 =
    targetCheck === "ok" &&
    matchedBy === "a" &&
    ipv6Addresses.length > 0 &&
    !ipv6Addresses.every((ip) => ourIpv6.has(ip));

  const targetFound = cnames.length > 0 ? cnames : addresses;
  const details: DnsCheckDetails = {
    txt: txtCheck,
    target: strayIpv6 ? "mismatch" : targetCheck,
    targetFound: strayIpv6 ? [...addresses, ...ipv6Addresses] : targetFound,
    matchedBy: strayIpv6 ? null : matchedBy,
  };

  // Report the record that sends traffic first: without it nothing works,
  // and it's the one people most often get wrong (proxied, wrong target).
  // A lookup that errored (timeout, SERVFAIL) proves nothing either way, so
  // it's reported as dns_error rather than as a missing record.
  if (targetCheck === "proxied") return { ok: false, code: "cloudflare_proxied", details };
  if (targetCheck === "mismatch") return { ok: false, code: "target_mismatch", details };
  if (targetCheck === "error") return { ok: false, code: "dns_error", details };
  if (targetCheck === "missing") return { ok: false, code: "target_missing", details };
  if (strayIpv6) return { ok: false, code: "ipv6_mismatch", details };
  if (txtCheck === "error") return { ok: false, code: "dns_error", details };
  if (txtCheck === "missing") return { ok: false, code: "txt_missing", details };
  if (txtCheck === "mismatch") return { ok: false, code: "txt_mismatch", details };
  if (txtCheck === "conflict") return { ok: false, code: "txt_conflict", details };
  return { ok: true, details };
}
