import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Stand-in for the doc-converter microservice. We spin up a real HTTP server
 * on a random port, set `DOC_CONVERTER_URL` to point at it, and assert on the
 * bytes/headers the export handler emits downstream.
 *
 * Why a real socket instead of mocking `fetch`? The export route uses the
 * global `fetch` through `convertMarkdown`, and `getConverterBaseUrl()` reads
 * `DOC_CONVERTER_URL` at call time — so the cheapest way to test the whole
 * stack (timeouts, headers, error-message parsing) is to let it do a real
 * request against a real server that we control.
 */

type HandlerInput = {
  format: "docx" | "pdf";
  body: unknown;
  request: IncomingMessage;
};

type HandlerResult =
  | {
      kind: "success";
      bytes?: Buffer;
      contentType?: string;
      filename?: string;
    }
  | {
      kind: "error";
      status: number;
      body?: string;
      contentType?: string;
    };

export type MockHandler = (input: HandlerInput) => HandlerResult | Promise<HandlerResult>;

type CallRecord = {
  format: "docx" | "pdf";
  body: unknown;
  headers: IncomingMessage["headers"];
};

export type MockConverter = {
  url: string;
  calls: CallRecord[];
  setHandler: (handler: MockHandler) => void;
  close: () => Promise<void>;
};

function defaultHandler(input: HandlerInput): HandlerResult {
  // Small byte payload that mimics the shape of a real converter response.
  const body = input.body as { filename?: string } | null;
  const filename = `${body?.filename ?? "document"}.${input.format}`;
  const bytes = Buffer.from(`mock-${input.format}-bytes-for-${filename}`);
  return {
    kind: "success",
    bytes,
    contentType:
      input.format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf",
    filename,
  };
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function startMockConverter(initial?: MockHandler): Promise<MockConverter> {
  let handler: MockHandler = initial ?? defaultHandler;
  const calls: CallRecord[] = [];

  const server: Server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Only exercise the two endpoints the real converter exposes.
    const match = req.url ? /^\/convert\/(docx|pdf)\b/.exec(req.url) : null;
    if (!match || req.method !== "POST") {
      res.statusCode = 404;
      res.end();
      return;
    }
    const format = match[1] as "docx" | "pdf";
    const body = await readJson(req);
    calls.push({ format, body, headers: req.headers });

    let result: HandlerResult;
    try {
      result = await handler({ format, body, request: req });
    } catch (err) {
      res.statusCode = 500;
      res.end(err instanceof Error ? err.message : "mock handler failed");
      return;
    }

    if (result.kind === "error") {
      res.statusCode = result.status;
      res.setHeader("Content-Type", result.contentType ?? "text/plain");
      res.end(result.body ?? "");
      return;
    }

    const bytes =
      result.bytes ?? Buffer.from(`mock-${format}-default`);
    const contentType =
      result.contentType ??
      (format === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : "application/pdf");
    const filename = result.filename ?? `document.${format}`;

    res.statusCode = 200;
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(bytes.length));
    res.end(bytes);
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    // Bind to loopback on an OS-assigned port so we never collide with real
    // listeners on CI or dev boxes.
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  const address = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${address.port}`;

  return {
    url,
    calls,
    setHandler: (next) => {
      handler = next;
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => {
          if (err) rejectClose(err);
          else resolveClose();
        });
      }),
  };
}
