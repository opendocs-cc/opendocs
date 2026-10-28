import { instanceWebUrl } from "@opendocs/shared/config/instance";

/**
 * Whether the page is open on OpenDocs itself (opendocs.cc, its
 * subdomains, localhost) rather than on a workspace's custom domain.
 * Custom domains are the customer's site: no Plausible, no ad pixels and
 * no cookie banner there. Checked in the browser so the root layout can
 * stay static; false on the server, where none of this runs anyway.
 */
export function isOpenDocsBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return true;
  const own = new URL(instanceWebUrl()).hostname;
  return host === own || host.endsWith(`.${own}`) || host === "opendocs.cc" || host.endsWith(".opendocs.cc");
}
