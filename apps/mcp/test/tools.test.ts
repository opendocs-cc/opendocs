import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ALL_SCOPES } from "../src/config";
import { INSTRUCTIONS } from "../src/instructions";
import { TOOLS } from "../src/tools";

// What the Anthropic and OpenAI directories check, and what clients need.
describe("tool definitions", () => {
  it("have unique, valid names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });

  it("each have a title, a scope, all four hints and a usable description", () => {
    for (const tool of TOOLS) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(ALL_SCOPES as readonly string[], tool.name).toContain(tool.scope);
      for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"] as const) {
        expect(typeof tool.annotations[hint], `${tool.name}.${hint}`).toBe("boolean");
      }
      expect(tool.description.length, tool.name).toBeGreaterThan(60);
      expect(tool.description.length, tool.name).toBeLessThan(4096);
      expect(tool.input).toBeInstanceOf(z.ZodObject);
    }
  });

  it("never mark a writing tool read-only", () => {
    const readOnly = TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    for (const name of readOnly) {
      expect(name).toMatch(/^(get_|list_|export_document$)/);
    }
  });

  it("mark deleting and sending tools destructive", () => {
    for (const name of [
      "delete_document", "unpublish_document", "remove_team_member", "send_signature_request",
      "share_document", "change_member_role", "revoke_invitation", "rename_project",
    ]) {
      const tool = TOOLS.find((t) => t.name === name);
      expect(tool?.annotations.destructiveHint, name).toBe(true);
    }
  });

  // What people with a document's link see, and email, count as the outside world.
  it("mark tools that change shared content or send email open-world", () => {
    for (const name of [
      "publish_document", "edit_document", "update_document", "restore_document_version", "share_document",
      "invite_people", "resend_invitation", "rename_project",
    ]) {
      const tool = TOOLS.find((t) => t.name === name);
      expect(tool?.annotations.openWorldHint, name).toBe(true);
    }
  });

  // OpenAI's directory doesn't allow plugins to show plans or promote upgrades.
  it("never name plans or point at billing", () => {
    for (const tool of TOOLS) {
      const text = `${tool.description} ${JSON.stringify(z.toJSONSchema(tool.input))}`;
      expect(text, tool.name).not.toMatch(/\b(Free|Pro|Team) (plan|workspace)|\bPro or Team\b|\bPro and Team\b|upgrad|pricing|billing/i);
    }
  });

  // ChatGPT's tool scan rejects any other shape for openai/fileParams fields.
  it("give file parameters OpenAI's file object schema", () => {
    for (const tool of TOOLS) {
      const fields = (tool.meta?.["openai/fileParams"] as string[] | undefined) ?? [];
      const props = (z.toJSONSchema(tool.input) as { properties: Record<string, any> }).properties;
      for (const field of fields) {
        const file = props[field];
        expect(Object.keys(file.properties).sort(), `${tool.name}.${field}`).toEqual(
          ["download_url", "file_id", "file_name", "mime_type"],
        );
        expect([...file.required].sort(), `${tool.name}.${field}`).toEqual(["download_url", "file_id"]);
      }
    }
  });

  it("put the essentials in the first 512 characters of the instructions", () => {
    expect(INSTRUCTIONS.length).toBeLessThan(4096);
    const head = INSTRUCTIONS.slice(0, 512);
    expect(head).toMatch(/public/);
    expect(head).toMatch(/workspace members/);
  });

  it("covers every CLI capability the plan lists", () => {
    const names = new Set(TOOLS.map((t) => t.name));
    for (const name of [
      "get_account", "set_defaults", "list_documents", "get_document", "get_document_history", "list_projects",
      "publish_document", "publish_documents", "update_document", "edit_document", "restore_document_version",
      "move_document", "set_document_visibility", "share_document", "unpublish_document", "delete_document",
      "claim_anonymous_document", "upload_image", "export_document", "create_project", "rename_project",
      "delete_project", "list_team", "invite_people", "change_member_role", "resend_invitation", "revoke_invitation",
      "remove_team_member",
      "respond_to_invitation", "leave_workspace", "create_workspace", "set_auto_join_domains",
      "get_export_theme", "update_export_theme", "save_to_drive", "create_signature_draft",
      "send_signature_request", "list_signature_requests", "get_signature_request",
      "cancel_signature_request", "file_signed_documents",
    ]) {
      expect(names.has(name), name).toBe(true);
    }
  });
});
