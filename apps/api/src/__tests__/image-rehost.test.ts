import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { LookupAddress } from "node:dns";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __internal,
  rehostRemoteImages,
} from "@opendocs/shared/posts/image-rehost";

// DNS answers are controlled per test; by default lookups go to the real
// resolver.
const dns = vi.hoisted(() => ({
  lookup: vi.fn(),
  real: null as null | ((...args: unknown[]) => Promise<unknown>),
}));
vi.mock("node:dns/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:dns/promises")>();
  dns.real = actual.lookup as never;
  dns.lookup.mockImplementation(actual.lookup);
  return { ...actual, default: { ...actual, lookup: dns.lookup }, lookup: dns.lookup };
});

function answerDns(...answers: LookupAddress[][]) {
  for (const answer of answers) dns.lookup.mockResolvedValueOnce(answer);
}

// ---- URL detection -----------------------------------------------------

describe("image regex", () => {
  const { findImages } = __internal;

  it("extracts inline images", () => {
    const md = "# Hello\n\n![cat](https://example.com/cat.png)\n\ntext";
    const found = findImages(md);
    expect(found).toHaveLength(1);
    expect(found[0].alt).toBe("cat");
    expect(found[0].url).toBe("https://example.com/cat.png");
  });

  it("extracts images with optional title", () => {
    const md = `![alt](https://ex.com/a.jpg "Title here")`;
    const found = findImages(md);
    expect(found).toHaveLength(1);
    expect(found[0].url).toBe("https://ex.com/a.jpg");
  });

  it("handles multiple images in one document", () => {
    const md = `![a](https://ex.com/a.png)\n\n![b](https://ex.com/b.png)`;
    const found = findImages(md);
    expect(found.map((f) => f.url)).toEqual([
      "https://ex.com/a.png",
      "https://ex.com/b.png",
    ]);
  });

  it("ignores bare links", () => {
    const md = `[not an image](https://ex.com)`;
    expect(findImages(md)).toHaveLength(0);
  });
});

// ---- SSRF guard --------------------------------------------------------

describe("SSRF guard", () => {
  const { isPrivateIp, isSafeHost } = __internal;

  it("blocks private IPv4 ranges", () => {
    expect(isPrivateIp("10.0.0.1")).toBe(true);
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true); // AWS/GCP metadata
    expect(isPrivateIp("172.16.0.5")).toBe(true);
    expect(isPrivateIp("172.31.255.1")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("100.64.0.1")).toBe(true); // CGNAT
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true); // multicast
  });

  it("allows public IPv4", () => {
    expect(isPrivateIp("1.1.1.1")).toBe(false);
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("208.80.154.224")).toBe(false); // upload.wikimedia.org
  });

  it("blocks private IPv6", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("ff00::1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true); // v4-mapped private
    // The same, in the hex form URLs and some resolvers print.
    expect(isPrivateIp("::ffff:7f00:1")).toBe(true); // 127.0.0.1
    expect(isPrivateIp("::ffff:a9fe:a9fe")).toBe(true); // 169.254.169.254
    expect(isPrivateIp("64:ff9b::a9fe:a9fe")).toBe(true); // NAT64 metadata
    expect(isPrivateIp("::7f00:1")).toBe(true); // IPv4-compatible
    expect(isPrivateIp("fe9a::1")).toBe(true); // link-local is fe80::/10
    expect(isPrivateIp("FD12:3456::1")).toBe(true);
  });

  it("allows public IPv6", () => {
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false); // Google DNS
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects nonsense input (fail-closed)", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });

  it("rejects literal localhost hostnames", async () => {
    expect(await isSafeHost("localhost")).toBe(false);
    expect(await isSafeHost("service.local")).toBe(false);
    expect(await isSafeHost("api.internal")).toBe(false);
    expect(await isSafeHost("metadata.google.internal")).toBe(false);
  });

  it("rejects IP literals in private ranges", async () => {
    expect(await isSafeHost("127.0.0.1")).toBe(false);
    expect(await isSafeHost("169.254.169.254")).toBe(false);
  });
});

// ---- Rehost orchestration ---------------------------------------------

describe("rehostRemoteImages", () => {
  const origR2 = {
    url: process.env.R2_PUBLIC_URL,
    account: process.env.R2_ACCOUNT_ID,
    key: process.env.R2_ACCESS_KEY_ID,
    secret: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  };

  beforeEach(() => {
    process.env.R2_PUBLIC_URL = "https://assets.opendocs.cc";
    process.env.R2_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_BUCKET = "test-bucket";
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(origR2)) {
      const envKey = {
        url: "R2_PUBLIC_URL",
        account: "R2_ACCOUNT_ID",
        key: "R2_ACCESS_KEY_ID",
        secret: "R2_SECRET_ACCESS_KEY",
        bucket: "R2_BUCKET",
      }[k]!;
      if (v === undefined) delete process.env[envKey];
      else process.env[envKey] = v;
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns markdown untouched when storage is not configured", async () => {
    delete process.env.R2_PUBLIC_URL;
    const md = "![cat](https://example.com/cat.png)";
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });
    expect(out.markdown).toBe(md);
    expect(out.rehosted).toBe(0);
  });

  it("returns markdown untouched when there are no images", async () => {
    const md = "# Hi\n\nNo images here.";
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });
    expect(out.markdown).toBe(md);
    expect(out.rehosted).toBe(0);
  });

  it("leaves URLs already on the R2 public origin untouched", async () => {
    const md = `![cat](https://assets.opendocs.cc/posts/w1/images/abc.png)`;
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });
    expect(out.markdown).toBe(md);
    expect(out.rehosted).toBe(0);
    expect(out.skipped).toBe(0);
  });

  it("skips non-http schemes (data URIs, relative paths)", async () => {
    const md = [
      "![a](data:image/png;base64,AAAA)",
      "![b](/local/path.png)",
    ].join("\n\n");
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });
    expect(out.markdown).toBe(md);
    expect(out.rehosted).toBe(0);
    expect(out.skipped).toBe(2);
  });

  it("rehosts a remote image via mocked fetch + upload", async () => {
    // Mock fetch to return a tiny PNG.
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const mockResp = new Response(pngBytes, {
      status: 200,
      headers: {
        "content-type": "image/png",
        "content-length": String(pngBytes.byteLength),
      },
    });
    vi.spyOn(__internal.transport, "fetch").mockResolvedValue(mockResp);

    // Mock the R2 upload so it doesn't actually talk to S3.
    const r2 = await import("@opendocs/shared/storage/r2");
    const uploadSpy = vi
      .spyOn(r2, "uploadObject")
      .mockImplementation(async ({ key }) => ({
        url: `https://assets.opendocs.cc/${key}`,
        key,
      }));

    const md = `![cat](https://example.com/cat.png)`;
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });

    expect(out.rehosted).toBe(1);
    expect(out.skipped).toBe(0);
    expect(uploadSpy).toHaveBeenCalledOnce();
    expect(out.markdown).toMatch(
      /^!\[cat\]\(https:\/\/assets\.opendocs\.cc\/posts\/w1\/images\/[^)]+\.png\)$/,
    );
  });

  it("de-duplicates repeated URLs within a single document", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fetchMock = vi.spyOn(__internal.transport, "fetch").mockImplementation(
      async () =>
        new Response(pngBytes, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
    );

    const r2 = await import("@opendocs/shared/storage/r2");
    vi.spyOn(r2, "uploadObject").mockImplementation(async ({ key }) => ({
      url: `https://assets.opendocs.cc/${key}`,
      key,
    }));

    const md = [
      `![a](https://example.com/same.png)`,
      `![b](https://example.com/same.png)`,
    ].join("\n\n");

    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(out.rehosted).toBe(1);
    // Both occurrences rewritten to the same new URL.
    const urls = [...out.markdown.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe(urls[1]);
  });

  it("leaves the URL in place when fetch fails", async () => {
    vi.spyOn(__internal.transport, "fetch").mockRejectedValue(new Error("boom"));
    const r2 = await import("@opendocs/shared/storage/r2");
    const uploadSpy = vi.spyOn(r2, "uploadObject");

    const md = `![x](https://example.com/x.png)`;
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });

    expect(out.rehosted).toBe(0);
    expect(out.skipped).toBe(1);
    expect(out.markdown).toBe(md);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it("refuses to download non-image content types", async () => {
    const mockResp = new Response("<html></html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    vi.spyOn(__internal.transport, "fetch").mockResolvedValue(mockResp);
    const r2 = await import("@opendocs/shared/storage/r2");
    const uploadSpy = vi.spyOn(r2, "uploadObject");

    const md = `![x](https://example.com/x.png)`;
    const out = await rehostRemoteImages({ markdown: md, workspaceId: "w1" });

    expect(out.rehosted).toBe(0);
    expect(out.skipped).toBe(1);
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});

// ---- Connect-time check (DNS rebinding) --------------------------------

describe("downloads connect only to checked addresses", () => {
  const { guardedLookup, transport, downloadImage, isSafeHost } = __internal;
  let server: Server;
  let port: number;
  let hits = 0;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { "content-type": "image/png" });
      res.end(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    hits = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    dns.lookup.mockReset();
    dns.lookup.mockImplementation(dns.real!);
  });

  const lookup = (hostname: string, options: { all?: boolean; family?: number }) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) => {
      guardedLookup(hostname, options, (err, address, family) => resolve({ err, address, family }));
    });

  it("hands the socket the public addresses it checked", async () => {
    answerDns([{ address: "93.184.216.34", family: 4 }, { address: "2606:2800:220:1::1", family: 6 }]);
    const all = await lookup("images.example.com", { all: true });
    expect(all.err).toBeNull();
    expect(all.address).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1::1", family: 6 },
    ]);

    answerDns([{ address: "2606:2800:220:1::1", family: 6 }, { address: "93.184.216.34", family: 4 }]);
    const v4 = await lookup("images.example.com", { family: 4 });
    expect(v4).toMatchObject({ err: null, address: "93.184.216.34", family: 4 });
  });

  it("refuses a hostname with any private address", async () => {
    answerDns([{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 }]);
    const { err } = await lookup("mixed.example.com", { all: true });
    expect(err?.code).toBe("ERR_IMAGE_REHOST_BLOCKED_HOST");
  });

  it("refuses at connect time a hostname that resolves to a private address", async () => {
    answerDns([{ address: "127.0.0.1", family: 4 }]);
    const fetching = transport.fetch(`http://rebind.example.com:${port}/cat.png`, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: {},
    });
    await expect(fetching).rejects.toMatchObject({
      cause: expect.objectContaining({ code: "ERR_IMAGE_REHOST_BLOCKED_HOST" }),
    });
    expect(hits).toBe(0);
    expect(dns.lookup).toHaveBeenCalledWith("rebind.example.com", expect.anything());
  });

  it("isn't fooled by a record that answers public for the check and private for the connect", async () => {
    // What a DNS-rebinding attacker serves: a public address first, then
    // (TTL 0) a private one. A separate check-then-fetch would pass the
    // check and connect to 127.0.0.1.
    answerDns([{ address: "93.184.216.34", family: 4 }], [{ address: "127.0.0.1", family: 4 }]);
    expect(await isSafeHost("rebind.example.com")).toBe(true);
    const result = await downloadImage(`http://rebind.example.com:${port}/cat.png`);
    expect(result).toEqual({ ok: false, reason: "blocked_host" });
    expect(hits).toBe(0);
  });

  it("re-checks every redirect hop", async () => {
    const fetchSpy = vi.spyOn(transport, "fetch");
    // An IP literal is refused before connecting.
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
    );
    expect(await downloadImage("https://images.example.com/a.png")).toEqual({ ok: false, reason: "blocked_host" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // So is the hex form of an IPv4-mapped loopback address.
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: `http://[::ffff:127.0.0.1]:${port}/x.png` } }),
    );
    expect(await downloadImage("https://images.example.com/b.png")).toEqual({ ok: false, reason: "blocked_host" });

    // A hostname is checked as the connection opens (the real transport).
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 301, headers: { location: `http://internal.example.com:${port}/x.png` } }),
    );
    answerDns([{ address: "127.0.0.1", family: 4 }]);
    expect(await downloadImage("https://images.example.com/c.png")).toEqual({ ok: false, reason: "blocked_host" });
    expect(hits).toBe(0);
  });
});
