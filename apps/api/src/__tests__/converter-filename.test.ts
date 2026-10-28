import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asciiFilename, attachmentHeader, convertMarkdown } from "../lib/converter";
import { startMockConverter, type MockConverter } from "../test-helpers/mock-converter";

// Drive saves and signature drafts name the file after the document title.
// The converter puts that name in a Latin-1 header, so a title with an em
// dash made every PDF render fail with 502.
describe("converter filenames", () => {
  let converter: MockConverter;
  const saved = process.env.DOC_CONVERTER_URL;

  beforeAll(async () => {
    converter = await startMockConverter();
    process.env.DOC_CONVERTER_URL = converter.url;
  });

  afterAll(async () => {
    await converter.close();
    if (saved === undefined) delete process.env.DOC_CONVERTER_URL;
    else process.env.DOC_CONVERTER_URL = saved;
  });

  it("makes titles ASCII", () => {
    expect(asciiFilename("OpenDocs Drive Export Test — 26 October 2026")).toBe(
      "OpenDocs Drive Export Test - 26 October 2026",
    );
    expect(asciiFilename("Kaupsamningur um bifreið – Jón Jónsson")).toBe("Kaupsamningur um bifreid - Jon Jonsson");
    expect(asciiFilename("日本語")).toBe("document");
  });

  it("sends the converter an ASCII filename", async () => {
    await convertMarkdown("pdf", { markdown: "# Hi", filename: "Contract — Ágúst" });
    expect((converter.calls.at(-1)?.body as { filename?: string }).filename).toBe("Contract - Agust");
  });

  it("builds attachment headers for any name", () => {
    expect(attachmentHeader("Samningur — ný.pdf")).toBe(
      `attachment; filename="Samningur - n-.pdf"; filename*=UTF-8''Samningur%20%E2%80%94%20n%C3%BD.pdf`,
    );
  });
});
