import { isIP } from "node:net";
import { domainToASCII } from "node:url";

import { siteConfig } from "../config/site";
import { instanceWebUrl, isSelfHosted } from "../config/instance";

/**
 * Hostname rules for custom domains. Everything here is pure (no database),
 * so the API, the web middleware and the tests share one definition of what
 * a valid custom domain is.
 */

export type HostnameKind = "subdomain" | "apex";

export type HostnameRejection =
  | "empty"
  | "invalid"
  | "ip_address"
  | "too_long"
  | "single_label"
  | "reserved"
  | "opendocs";

export type HostnameValidation =
  | { ok: true; hostname: string; kind: HostnameKind }
  | { ok: false; reason: HostnameRejection; message: string };

const HOSTNAME_REJECTION_MESSAGES: Record<HostnameRejection, string> = {
  empty: "Enter a domain name, for example notes.example.com.",
  invalid: "That isn't a valid domain name. Enter one like notes.example.com, without https:// or a path.",
  ip_address: "Enter a domain name, not an IP address.",
  too_long: "That domain name is too long.",
  single_label: "Enter a full domain name, for example notes.example.com.",
  reserved: "That domain is reserved and can't be connected.",
  opendocs: "OpenDocs domains can't be used as a custom domain.",
};

// Top-level names that never resolve on the public internet (RFC 2606,
// RFC 6761, RFC 6762, RFC 7686 and common private-network suffixes).
// `localhost` is allowed outside production for local testing.
const RESERVED_TLDS = new Set([
  "local",
  "localdomain",
  "internal",
  "intranet",
  "corp",
  "home",
  "lan",
  "private",
  "test",
  "example",
  "invalid",
  "onion",
  "arpa",
]);

const RESERVED_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

// Second-level public suffixes where a three-label name is still an apex
// domain (acme.co.uk). Only decides whether we suggest a CNAME or A records;
// verification accepts either, so a name missing here still works.
const MULTI_LABEL_SUFFIXES = new Set([
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk", "ac.uk", "gov.uk",
  "com.au", "net.au", "org.au", "edu.au", "gov.au",
  "co.nz", "org.nz", "net.nz",
  "co.jp", "or.jp", "ne.jp",
  "co.kr", "or.kr",
  "com.br", "net.br", "org.br",
  "com.mx", "com.ar", "com.co", "com.tr", "com.tw", "com.hk", "com.sg", "com.my",
  "com.cn", "net.cn", "org.cn",
  "co.in", "net.in", "org.in", "firm.in",
  "co.za", "org.za",
  "co.il", "org.il",
  "com.pl", "com.es", "com.pt", "com.gr", "com.ua",
  "co.id", "co.th", "com.vn", "com.ph", "com.pk", "com.ng", "com.eg", "com.sa",
]);

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isProduction() {
  return process.env.NODE_ENV === "production";
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Domains that belong to OpenDocs itself: opendocs.cc and every subdomain,
 * the CNAME target, and the hosts this deployment runs on. None of them can
 * be connected as a custom domain, and the web middleware never treats them
 * as one.
 */
export function openDocsDomainSuffixes(): string[] {
  const hosts = [
    hostOf(siteConfig.url),
    "opendocs.cc",
    customDomainCnameTarget(),
    hostOf(process.env.BETTER_AUTH_URL),
    hostOf(process.env.WEB_APP_URL),
    hostOf(process.env.API_URL),
    hostOf(process.env.NEXT_PUBLIC_API_URL),
  ];
  return [...new Set(hosts.filter((host): host is string => Boolean(host)))];
}

/**
 * custom.<this instance's domain>: custom.opendocs.cc on opendocs.cc and in
 * development, custom.example.com on a self-hosted instance at example.com.
 */
function defaultCnameTarget(): string {
  const host = new URL(instanceWebUrl()).hostname;
  const local = host === "localhost" || isIP(host) !== 0;
  return `custom.${isSelfHosted() && !local ? host : "opendocs.cc"}`;
}

/** The name customers point their CNAME at. */
export function customDomainCnameTarget(): string {
  return (process.env.CUSTOM_DOMAIN_CNAME_TARGET?.trim() || defaultCnameTarget())
    .toLowerCase()
    .replace(/\.$/, "");
}

/** Our IPv4 addresses, for apex domains (A records). Empty when unset. */
export function customDomainIpv4Addresses(): string[] {
  return (process.env.CUSTOM_DOMAIN_IPV4 ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => isIP(value) === 4);
}

function matchesSuffix(hostname: string, suffix: string) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

/** True for opendocs.cc, its subdomains and this deployment's own hosts. */
export function isOpenDocsDomain(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  // localhost and 127.0.0.1 are where the app itself runs in development.
  if (host === "localhost") return true;
  return openDocsDomainSuffixes().some((suffix) =>
    // Dev hosts (localhost, 127.0.0.1) only match exactly, so
    // notes.localhost stays usable as a test custom domain.
    suffix === "localhost" || isIP(suffix) ? host === suffix : matchesSuffix(host, suffix),
  );
}

/** Dev-only test domains like notes.localhost (browsers resolve them locally). */
export function isLocalTestHostname(hostname: string): boolean {
  return !isProduction() && hostname.endsWith(".localhost") && hostname !== "localhost";
}

/**
 * The domain a hostname is registered under (its apex): example.is for
 * notes.example.is, acme.co.uk for docs.acme.co.uk. A heuristic, not the
 * Public Suffix List; see MULTI_LABEL_SUFFIXES.
 */
export function registrableDomain(hostname: string): string {
  const labels = hostname.split(".");
  if (labels.length <= 2) return hostname;
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

export function hostnameKind(hostname: string): HostnameKind {
  if (isLocalTestHostname(hostname)) return "subdomain";
  return registrableDomain(hostname) === hostname ? "apex" : "subdomain";
}

/**
 * Pulls a hostname out of what someone typed or pasted: tolerates a scheme,
 * a trailing slash or dot and upper case, and converts non-ASCII names to
 * punycode. Returns null when there's no plausible hostname in it.
 */
export function parseHostnameInput(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.username || url.password || url.port) return null;
      if (url.pathname !== "/" || url.search || url.hash) return null;
      value = url.hostname;
    } catch {
      return null;
    }
  } else {
    value = value.replace(/\/+$/, "");
  }
  value = value.replace(/\.$/, "");
  // A port, path, credentials, spaces or other punctuation aren't part of
  // a hostname; domainToASCII would quietly drop some of them.
  if (/[\s/\\:@?#[\]%,;"'<>`|{}^]/.test(value)) return null;
  const ascii = domainToASCII(value.toLowerCase());
  return ascii || null;
}

/** Validates a custom domain the way the API accepts it. */
export function validateCustomHostname(input: string): HostnameValidation {
  const reject = (reason: HostnameRejection): HostnameValidation => ({
    ok: false,
    reason,
    message: HOSTNAME_REJECTION_MESSAGES[reason],
  });

  if (!input.trim()) return reject("empty");
  const hostname = parseHostnameInput(input);
  if (!hostname) return reject("invalid");
  if (isIP(hostname)) return reject("ip_address");
  if (hostname.length > 253) return reject("too_long");

  const labels = hostname.split(".");
  if (labels.length < 2) return reject(hostname === "localhost" ? "reserved" : "single_label");
  if (!labels.every((label) => LABEL_PATTERN.test(label))) return reject("invalid");
  // Top-level domains are letters (or punycode); an all-numeric last label
  // is an IP-like string such as 1.2.3.4.5.
  const tld = labels[labels.length - 1];
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) return reject("invalid");

  if (isOpenDocsDomain(hostname)) return reject("opendocs");
  if (tld === "localhost") {
    return isLocalTestHostname(hostname) ? { ok: true, hostname, kind: "subdomain" } : reject("reserved");
  }
  if (RESERVED_TLDS.has(tld)) return reject("reserved");
  if ([...RESERVED_DOMAINS].some((domain) => matchesSuffix(hostname, domain))) return reject("reserved");

  return { ok: true, hostname, kind: hostnameKind(hostname) };
}

/**
 * Normalizes an HTTP Host header: lowercase, no port, no trailing dot.
 * IPv6 literals keep their brackets stripped. Returns "" for nothing.
 */
export function normalizeHostHeader(host: string | null | undefined): string {
  if (!host) return "";
  let value = host.trim().toLowerCase();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    return end > 0 ? value.slice(1, end) : value;
  }
  const colon = value.lastIndexOf(":");
  if (colon > -1 && /^\d+$/.test(value.slice(colon + 1))) value = value.slice(0, colon);
  return value.replace(/\.$/, "");
}

/**
 * Hosts the web app answers as OpenDocs itself rather than as a custom
 * domain: OpenDocs domains, localhost, IP addresses (health checks and
 * Docker-internal requests) and single-label names like `web`.
 */
export function isOpenDocsHost(hostname: string): boolean {
  if (!hostname) return true;
  if (isIP(hostname)) return true;
  if (!hostname.includes(".")) return true;
  return isOpenDocsDomain(hostname);
}
