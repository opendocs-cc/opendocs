import { describe, expect, it } from "vitest";

import { ApiError } from "../src/api-client";
import { apiErrorResult } from "../src/lib/errors";

function text(result: ReturnType<typeof apiErrorResult>): string {
  return result.content.map((part) => (part.type === "text" ? part.text : "")).join("\n");
}

describe("apiErrorResult", () => {
  it("states plan limits without pricing links or upgrade prompts", () => {
    for (const [code, message] of [
      ["document_limit", "Cannot publish: your free plan is full. Upgrade to Pro for unlimited documents."],
      ["plan_required", "Integrations are a Pro feature. Upgrade at https://opendocs.cc/dashboard/billing."],
      ["member_limit", "This workspace has reached its plan's member limit. An admin needs to upgrade first."],
      ["docx_requires_pro", "DOCX export requires Pro. Upgrade at https://opendocs.cc/pricing."],
    ]) {
      const result = apiErrorResult(new ApiError(403, { error: code, message }));
      const said = text(result);
      expect(result.isError).toBe(true);
      expect(said).not.toMatch(/upgrade at|upgrade to|pricing|billing|https?:\/\//i);
      expect(said.length).toBeGreaterThan(20);
    }
  });

  it("keeps the API's message for other errors", () => {
    const result = apiErrorResult(new ApiError(404, { error: "not_found", message: "No document called plan." }));
    expect(text(result)).toContain("No document called plan.");
    expect(text(result)).toContain("list_documents");
  });
});
