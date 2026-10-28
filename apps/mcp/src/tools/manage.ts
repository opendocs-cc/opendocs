import { z } from "zod";

import type { ToolContext } from "../lib/context";
import { UserFacingError } from "../lib/errors";
import { docLink, ok, visibilityText } from "../lib/result";
import { defineTool, DESTRUCTIVE, DESTRUCTIVE_SHARED, WRITE, WRITE_SHARED } from "./types";

type PostDetail = {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  workspaceId?: string;
  url?: string;
  publicUrl?: string | null;
};

const docArg = z
  .string()
  .min(1)
  .describe("The document's link (opendocs.cc or a custom domain), slug or ID.");

async function getPost(ctx: ToolContext, document: string): Promise<PostDetail> {
  const target = await ctx.resolveDocument(document);
  const { post } = await ctx.api.get<{ post: PostDetail }>(
    `/posts/${encodeURIComponent(target.ref)}`,
    ctx.docQuery(target),
  );
  return post;
}

function requireConfirm(confirm: boolean, what: string) {
  if (!confirm) {
    throw new UserFacingError(
      `Ask the user to confirm that they want to ${what}, then call again with confirm: true.`,
      "confirmation_required",
    );
  }
}

/** Split "sam@acme.com, @acme.com, acme.com" into emails and domains (the CLI's rule). */
function splitPeople(values: string[]): { emails: string[]; domains: string[] } {
  const emails: string[] = [];
  const domains: string[] = [];
  for (const value of values.flatMap((v) => v.split(",")).map((v) => v.trim().toLowerCase()).filter(Boolean)) {
    if (value.startsWith("@")) domains.push(value.slice(1));
    else if (value.includes("@")) emails.push(value);
    else domains.push(value);
  }
  return { emails, domains };
}

export const restoreDocumentVersion = defineTool({
  name: "restore_document_version",
  title: "Restore an older version",
  description:
    "Bring back an older version of a document by publishing its content as a new version at the same link. Nothing is lost: the version being replaced stays in the history, so this can be undone. Find version numbers with get_document_history.",
  scope: "docs:write",
  annotations: WRITE_SHARED,
  input: z.object({ document: docArg, version: z.number().int().positive() }),
  async run(args, ctx) {
    const post = await getPost(ctx, args.document);
    const result = await ctx.api.post<{ versionNumber: number; restoredFromVersion: number; title: string }>(
      `/posts/${post.id}/versions/${args.version}/restore`,
      {},
      { workspaceId: post.workspaceId },
    );
    return ok(
      `Restored version ${result.restoredFromVersion} of "${result.title}" as version ${result.versionNumber}:\n${docLink(post, ctx.webUrl)}`,
      {
        id: post.id,
        title: result.title,
        link: docLink(post, ctx.webUrl),
        version: result.versionNumber,
        restoredFrom: result.restoredFromVersion,
      },
    );
  },
});

export const moveDocument = defineTool({
  name: "move_document",
  title: "Move a document to another project",
  description:
    "Move a document to another project in the same workspace (by project name, slug or ID; a new name creates the project). Its link changes and the old link stops working, so tell the user before moving and update documents that link to it afterwards.",
  scope: "docs:write",
  annotations: DESTRUCTIVE,
  input: z.object({ document: docArg, project: z.string().min(1) }),
  async run(args, ctx) {
    const post = await getPost(ctx, args.document);
    if (!post.workspaceId) throw new UserFacingError("Couldn't tell which workspace the document is in.");
    const { project, created } = await ctx.resolveProject(post.workspaceId, args.project, { create: true });
    const result = await ctx.api.post<{
      moved?: boolean;
      url: string;
      publicUrl?: string | null;
      projectName: string;
      slug: string;
      previousSlug?: string | null;
    }>(`/posts/${post.id}/move`, { projectId: project.id }, { workspaceId: post.workspaceId });
    const link = docLink(result, ctx.webUrl);
    if (result.moved === false) {
      return ok(`"${post.title}" is already in the "${result.projectName}" project:\n${link}`, {
        id: post.id,
        title: post.title,
        link,
        project: result.projectName,
        moved: false,
      });
    }
    return ok(
      [
        `Moved "${post.title}" to the "${result.projectName}" project${created ? " (new)" : ""}. Its new link:`,
        link,
        `The old link (${docLink(post, ctx.webUrl)}) no longer works.${
          result.previousSlug && result.previousSlug !== result.slug
            ? ` The slug changed from ${result.previousSlug} to ${result.slug} because the old one was taken there.`
            : ""
        }`,
      ].join("\n"),
      {
        id: post.id,
        title: post.title,
        link,
        project: result.projectName,
        projectCreated: created,
        moved: true,
        previousLink: docLink(post, ctx.webUrl),
        previousLinkWorks: false,
        slug: result.slug,
        previousSlug: result.previousSlug ?? null,
      },
    );
  },
});

export const setDocumentVisibility = defineTool({
  name: "set_document_visibility",
  title: "Change who can open a document",
  description:
    "Change a document's visibility: private (only the user), workspace (workspace members) or public (anyone with the link). Public also needs confirm_public: true, which records that the user chose to make it open to anyone with the link. If people outside the workspace still can't open a public document, a workspace owner has to turn on \"Allow public documents\" in workspace settings. To give specific people access, use share_document instead.",
  scope: "docs:write",
  annotations: DESTRUCTIVE_SHARED,
  input: z.object({
    document: docArg,
    visibility: z.enum(["private", "workspace", "public"]),
    confirm_public: z.boolean().default(false),
  }),
  async run(args, ctx) {
    if (args.visibility === "public" && !args.confirm_public) {
      throw new UserFacingError(
        "Making a document public needs the user's explicit yes. Ask them, then call again with confirm_public: true.",
        "confirm_public_required",
      );
    }
    const post = await getPost(ctx, args.document);
    await ctx.api.post(`/posts/${post.id}/visibility`, {
      visibility: args.visibility,
      confirmPublic: args.confirm_public,
    });
    return ok(
      `"${post.title}" is now ${args.visibility}. ${visibilityText(args.visibility)}\n${docLink(post, ctx.webUrl)}`,
      { id: post.id, title: post.title, link: docLink(post, ctx.webUrl), visibility: args.visibility },
    );
  },
});

export const shareDocument = defineTool({
  name: "share_document",
  title: "Share a document with people",
  description:
    "Give specific people outside the workspace access to one document, or take it away. People can be email addresses or whole email domains (\"@acme.com\"). They sign in with that email to read it and don't join the workspace. By default each new person gets an email with the link (notify: false to skip). With neither add nor remove, it lists who has access. Confirm the exact addresses with the user before adding.",
  scope: "docs:write",
  annotations: DESTRUCTIVE_SHARED,
  input: z.object({
    document: docArg,
    add: z.array(z.string()).max(50).optional().describe("Emails or @domains to give access."),
    remove: z.array(z.string()).max(50).optional().describe("Emails or @domains to remove."),
    notify: z.boolean().default(true),
  }),
  async run(args, ctx) {
    const post = await getPost(ctx, args.document);
    const path = `/posts/${post.id}/share`;
    const query = { workspaceId: post.workspaceId };
    let notified: string[] = [];
    if (args.remove?.length) {
      await ctx.api.delete(path, splitPeople(args.remove), query);
    }
    if (args.add?.length) {
      const added = await ctx.api.post<{ notified?: string[] }>(path, { ...splitPeople(args.add), notify: args.notify }, query);
      notified = added.notified ?? [];
    }
    const current = await ctx.api.get<{ emails: string[]; domains: string[] }>(path, query);
    const people = [...current.emails, ...current.domains.map((d) => `everyone @${d}`)];
    return ok(
      [
        `"${post.title}" ${visibilityText(post.visibility).toLowerCase().replace(/\.$/, "")}${
          people.length ? `, and it's shared with: ${people.join(", ")}` : ""
        }.`,
        notified.length ? `Emailed the link to: ${notified.join(", ")}.` : "",
        docLink(post, ctx.webUrl),
      ]
        .filter(Boolean)
        .join("\n"),
      {
        id: post.id,
        title: post.title,
        link: docLink(post, ctx.webUrl),
        visibility: post.visibility,
        sharedWith: current,
        notified,
      },
    );
  },
});

export const unpublishDocument = defineTool({
  name: "unpublish_document",
  title: "Unpublish a document",
  description:
    "Take a document offline: its link stops working but the content, history and link are kept, and it no longer counts toward the workspace's document limit. Prefer this over delete_document when the user says \"remove\" or \"take down\". Check with the user first.",
  scope: "docs:write",
  annotations: DESTRUCTIVE,
  input: z.object({ document: docArg }),
  async run(args, ctx) {
    const post = await getPost(ctx, args.document);
    await ctx.api.post(`/posts/${post.id}/unpublish`, {});
    return ok(`Unpublished "${post.title}". Its link no longer works; the content and history are kept.`, {
      id: post.id,
      title: post.title,
      unpublished: true,
      contentKept: true,
    });
  },
});

export const deleteDocument = defineTool({
  name: "delete_document",
  title: "Delete a document permanently",
  description:
    "Permanently delete a document with every version. This can't be undone; unpublish_document takes a document offline and keeps it. confirm: true records that the user asked for permanent deletion.",
  scope: "docs:write",
  annotations: DESTRUCTIVE,
  input: z.object({ document: docArg, confirm: z.boolean() }),
  async run(args, ctx) {
    requireConfirm(args.confirm, "permanently delete the document");
    const post = await getPost(ctx, args.document);
    await ctx.api.delete(`/posts/${post.id}`);
    return ok(`Deleted "${post.title}" permanently.`, { id: post.id, title: post.title, deleted: true });
  },
});

export const claimAnonymousDocument = defineTool({
  name: "claim_anonymous_document",
  title: "Keep an anonymous document",
  description:
    "Move a document that was published without an account (a 24-hour link) into the user's workspace so it stays. Needs its claim link (…/claim/<token>) or token.",
  scope: "docs:write",
  annotations: WRITE,
  input: z.object({
    claim: z.string().min(8).describe("The claim link or token."),
    project: z.string().optional(),
    workspace: z.string().optional(),
    visibility: z.enum(["private", "workspace"]).default("workspace"),
  }),
  async run(args, ctx) {
    const token = args.claim.trim().split("/claim/").pop()!.split(/[?#]/)[0]!;
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const project = args.project ? (await ctx.resolveProject(workspace.id, args.project, { create: true })).project : null;
    const result = await ctx.api.post<{ postId: string; title: string; url: string; publicUrl?: string | null }>(
      "/anonymous/claim",
      {
        claimToken: token,
        workspaceId: workspace.id,
        ...(project ? { projectId: project.id } : {}),
        visibility: args.visibility,
        confirmPublic: false,
      },
    );
    return ok(
      `"${result.title}" is now in ${workspace.name} and won't expire:\n${docLink(result, ctx.webUrl)}\n${visibilityText(args.visibility)}`,
      {
        id: result.postId,
        title: result.title,
        link: docLink(result, ctx.webUrl),
        workspace: workspace.name,
        project: project?.name ?? null,
        visibility: args.visibility,
        expires: false,
      },
    );
  },
});
