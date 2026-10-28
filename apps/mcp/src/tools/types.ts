import type { CallToolResult } from "@modelcontextprotocol/server";
import type { z } from "zod";

import type { Scope } from "../config";
import type { ToolContext } from "../lib/context";

/**
 * One MCP tool. Every tool states the scope it needs (tools the connection
 * wasn't granted are left out of tools/list), a human title and the four
 * behaviour hints directory reviewers and clients rely on: Claude asks the
 * user before running a destructiveHint tool, and openWorldHint marks tools
 * that make content visible to other people or send email.
 */
export type ToolDefinition<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  scope: Scope;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  input: S;
  meta?: Record<string, unknown>;
  run: (args: z.infer<S>, ctx: ToolContext) => Promise<CallToolResult>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = ToolDefinition<any>;

export function defineTool<S extends z.ZodObject>(definition: ToolDefinition<S>): ToolDefinition<S> {
  return definition;
}

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
export const WRITE_SHARED = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
export const DESTRUCTIVE_SHARED = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true };
