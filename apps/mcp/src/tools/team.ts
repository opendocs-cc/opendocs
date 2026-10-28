import { z } from "zod";

import { ApiError } from "../api-client";
import { config } from "../config";
import type { ToolContext, Workspace } from "../lib/context";
import { UserFacingError } from "../lib/errors";
import { fail, ok } from "../lib/result";
import { defineTool, DESTRUCTIVE, READ_ONLY, WRITE, WRITE_SHARED } from "./types";

/**
 * Team and workspaces: who is in a workspace, invitations (both sides),
 * email-domain auto-join, leaving and creating workspaces. The same routes
 * as the CLI's `opendocs team` and `opendocs workspace create`. Adding
 * people always goes through an emailed invitation the person accepts.
 */

type Member = {
  id: string;
  userId?: string;
  name?: string | null;
  email?: string | null;
  role: string;
  joinedAt?: string;
};
type PendingInvitation = {
  id: string;
  email: string;
  role: string;
  invitedAt?: string;
  invitedByName?: string | null;
};
type AutoJoinDomains = { domains: Array<{ domain: string; createdAt?: string }> };
type MyInvitations = {
  emailVerified: boolean;
  invitations: Array<{
    id: string;
    workspaceId: string;
    workspaceName: string;
    workspaceSlug: string;
    role: string;
    invitedByName?: string | null;
    expiresAt?: string;
  }>;
  joinable: Array<{ workspaceId: string; workspaceName: string; workspaceSlug: string; domain: string }>;
};
type JoinResult = {
  workspace: { id: string; name: string; slug: string };
  role: string;
  alreadyMember: boolean;
};

const workspaceArg = z
  .string()
  .optional()
  .describe("Workspace name, slug or ID. Defaults to this connection's default workspace.");
const emailArg = z.string().trim().min(3).max(320).describe("The person's email address.");

// Same rule as the CLI's signer emails: one @, no spaces or brackets, a dot
// in the domain and a TLD of 2+ characters.
const EMAIL_RE = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:.]{2,}$/;

function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email) && !email.includes("..");
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : "";
}

function requireConfirm(confirm: boolean, what: string) {
  if (!confirm) {
    throw new UserFacingError(
      `Ask the user to confirm that they want to ${what}, then call again with confirm: true.`,
      "confirmation_required",
    );
  }
}

async function findMember(ctx: ToolContext, workspace: Workspace, email: string): Promise<Member> {
  const { members } = await ctx.api.get<{ members: Member[] }>("/workspace/team", { workspaceId: workspace.id });
  const member = members.find((m) => m.email && norm(m.email) === norm(email));
  if (!member) {
    throw new UserFacingError(
      `${email} isn't a member of ${workspace.name}. Call list_team to see who is.`,
      "member_not_found",
    );
  }
  return member;
}

async function findInvitation(ctx: ToolContext, workspace: Workspace, email: string): Promise<PendingInvitation> {
  const { invitations } = await ctx.api.get<{ invitations: PendingInvitation[] }>("/workspace/team/invitations", {
    workspaceId: workspace.id,
  });
  const invitation = invitations.find((i) => norm(i.email) === norm(email));
  if (!invitation) {
    throw new UserFacingError(
      `There's no pending invitation for ${email} in ${workspace.name}. Call list_team to see pending invitations.`,
      "invitation_not_found",
    );
  }
  return invitation;
}

/** Why an invitation to one address failed, in words for the user. */
function inviteFailure(err: ApiError): string {
  switch (err.code) {
    case "already_member":
      return "already a member";
    case "already_invited":
      return "already has a pending invitation (resend_invitation emails it again)";
    case "invite_limit":
      return "the workspace has 50 pending invitations; revoke some first";
    case "member_limit": {
      const plan = typeof err.body.plan === "string" ? err.body.plan : null;
      const limit = typeof err.body.limit === "number" ? err.body.limit : null;
      return `the workspace has reached its member limit${
        plan && limit ? ` (${limit} on the ${plan} plan, pending invitations included)` : ""
      }`;
    }
    default:
      return err.body.message ?? err.message;
  }
}

const PER_EMAIL_ERRORS = new Set(["already_member", "already_invited", "invite_limit", "member_limit", "invalid_request"]);

export const listTeam = defineTool({
  name: "list_team",
  title: "List team members",
  description:
    "Who is in a workspace: members with their name, email and role, plus pending invitations and auto-join email domains. Pending invitations are only visible to owners and admins. Use it before changing roles, resending or revoking invitations, or removing someone, so you use their exact email.",
  scope: "docs:read",
  annotations: READ_ONLY,
  input: z.object({ workspace: workspaceArg }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const isAdmin = workspace.role === "owner" || workspace.role === "admin";
    const { members } = await ctx.api.get<{ members: Member[] }>("/workspace/team", { workspaceId: workspace.id });
    // Admin views: members get 403, so a failure here just means "not shown".
    const invitations = isAdmin
      ? await ctx.api
          .get<{ invitations: PendingInvitation[] }>("/workspace/team/invitations", { workspaceId: workspace.id })
          .then((r) => r.invitations)
          .catch(() => null)
      : null;
    const domains = await ctx.api
      .get<AutoJoinDomains>("/workspace/auto-join", { workspaceId: workspace.id })
      .then((r) => r.domains.map((d) => d.domain))
      .catch(() => null);

    const lines = [
      `${workspace.name} (${workspace.slug}) has ${members.length} member${members.length === 1 ? "" : "s"}. Your role: ${workspace.role}.`,
    ];
    for (const m of members) {
      lines.push(`- ${m.name || m.email || "?"}${m.name && m.email ? ` <${m.email}>` : ""}, ${m.role}`);
    }
    if (invitations === null) {
      if (!isAdmin) lines.push("", "Pending invitations are only visible to owners and admins.");
    } else if (invitations.length > 0) {
      lines.push("", `Pending invitations (${invitations.length}), waiting for the person to accept:`);
      for (const i of invitations) {
        lines.push(
          `- ${i.email} as ${i.role}${i.invitedAt ? `, invited ${day(i.invitedAt)}` : ""}${
            i.invitedByName ? ` by ${i.invitedByName}` : ""
          }`,
        );
      }
    } else {
      lines.push("", "No pending invitations.");
    }
    if (domains && domains.length > 0) {
      lines.push(
        "",
        `Auto-join: anyone with a verified ${domains.map((d) => `@${d}`).join(", ")} email can join without an invitation.`,
      );
    }
    return ok(lines.join("\n"), {
      workspace,
      members: members.map((m) => ({
        name: m.name ?? null,
        email: m.email ?? null,
        role: m.role,
        status: "active",
        joinedAt: m.joinedAt ?? null,
      })),
      invitations:
        invitations?.map((i) => ({
          email: i.email,
          role: i.role,
          status: "invited",
          invitedAt: i.invitedAt ?? null,
          invitedBy: i.invitedByName ?? null,
        })) ?? null,
      autoJoinDomains: domains,
    });
  },
});

export const invitePeople = defineTool({
  name: "invite_people",
  title: "Invite people to a workspace",
  description:
    "Invite people to a workspace by email. Each person gets an invitation email and is only added once they accept it. This sends email, so first confirm the exact addresses and the role with the user (member by default; admin only if they asked). Afterwards tell them each person has to accept the email. The workspace's plan can limit how many members it holds, pending invitations included. The result lists who was invited and why any address failed.",
  scope: "workspace:admin",
  annotations: WRITE_SHARED,
  input: z.object({
    emails: z.array(z.string().trim().min(3).max(320)).min(1).max(20).describe("Email addresses exactly as the user gave them."),
    role: z.enum(["member", "admin"]).default("member"),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const emails = [...new Set(args.emails.map(norm))];
    const invalid = emails.filter((e) => !isValidEmail(e));
    if (invalid.length > 0) {
      throw new UserFacingError(
        `Nobody was invited: ${invalid.map((e) => `"${e}"`).join(", ")} ${
          invalid.length === 1 ? "isn't a valid email address" : "aren't valid email addresses"
        }. Ask the user for the exact address; don't guess it.`,
        "invalid_email",
      );
    }
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const results: Array<{ email: string; invited: boolean; error?: string; message?: string }> = [];
    for (const email of emails) {
      try {
        await ctx.api.post("/workspace/team/invite", { email, role: args.role, workspaceId: workspace.id });
        results.push({ email, invited: true });
      } catch (err) {
        // Permission, scope and connection errors apply to every address: let the server explain them.
        if (!(err instanceof ApiError) || (!PER_EMAIL_ERRORS.has(err.code) && results.every((r) => !r.invited))) {
          throw err;
        }
        results.push({ email, invited: false, error: err.code, message: inviteFailure(err) });
      }
    }
    const invited = results.filter((r) => r.invited).length;
    const lines = [
      invited === 0
        ? `Nobody was invited to ${workspace.name}.`
        : `Invited ${invited === results.length ? (invited === 1 ? "1 person" : `all ${invited} people`) : `${invited} of ${results.length} people`} to ${workspace.name} as ${args.role}. Each person gets an email and is added once they accept it.`,
    ];
    for (const r of results) lines.push(`- ${r.email}: ${r.invited ? "invitation sent" : r.message}`);
    return ok(lines.join("\n"), { workspace, role: args.role, results });
  },
});

export const changeMemberRole = defineTool({
  name: "change_member_role",
  title: "Change a member's role",
  description:
    "Make a workspace member an admin, or an admin a member again. Identify the person by the email list_team shows. Admins can invite and remove people and change the workspace's settings, so confirm the change with the user first. Only owners and admins can do this; the owner's role can't be changed, and only the owner can turn an admin back into a member. Tell the user what changed.",
  scope: "workspace:admin",
  annotations: { ...DESTRUCTIVE, idempotentHint: true },
  input: z.object({
    email: emailArg,
    role: z.enum(["admin", "member"]).describe("The new role."),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const member = await findMember(ctx, workspace, args.email);
    if (member.role === "owner") {
      throw new UserFacingError(`${args.email} owns ${workspace.name}; the owner's role can't be changed.`, "forbidden");
    }
    if (member.role === args.role) {
      return ok(`${args.email} is already ${args.role === "admin" ? "an admin" : "a member"} of ${workspace.name}.`, {
        email: args.email,
        role: args.role,
        changed: false,
        workspace,
      });
    }
    try {
      await ctx.api.patch(`/workspace/team/members/${encodeURIComponent(member.id)}/role`, { role: args.role });
    } catch (err) {
      if (err instanceof ApiError && err.code === "forbidden") {
        throw new UserFacingError(
          "Only owners and admins can change roles, and only the owner can make an admin a member again.",
          "forbidden",
        );
      }
      throw err;
    }
    return ok(`${args.email} is now ${args.role === "admin" ? "an admin" : "a member"} of ${workspace.name}.`, {
      email: args.email,
      role: args.role,
      changed: true,
      workspace,
    });
  },
});

export const resendInvitation = defineTool({
  name: "resend_invitation",
  title: "Email an invitation again",
  description:
    "Email a pending workspace invitation to the person again, for example when they can't find it. Identify the invitation by the email list_team shows. This sends email, so check with the user first. Only owners and admins can do this. The person still has to accept it.",
  scope: "workspace:admin",
  annotations: WRITE_SHARED,
  input: z.object({
    email: emailArg,
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const invitation = await findInvitation(ctx, workspace, args.email);
    await ctx.api.post(`/workspace/team/invitations/${encodeURIComponent(invitation.id)}/resend`);
    return ok(`Sent the invitation to ${invitation.email} again. They still need to accept it.`, {
      email: invitation.email,
      resent: true,
      workspace,
    });
  },
});

export const revokeInvitation = defineTool({
  name: "revoke_invitation",
  title: "Cancel an invitation",
  description:
    "Cancel a workspace invitation that wasn't accepted yet: the link in the person's email stops working. Identify the invitation by the email list_team shows. Confirm with the user first; to undo it, invite the person again with invite_people. Only owners and admins can do this. To remove someone who already joined, use remove_team_member.",
  scope: "workspace:admin",
  annotations: DESTRUCTIVE,
  input: z.object({
    email: emailArg,
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    const invitation = await findInvitation(ctx, workspace, args.email);
    await ctx.api.delete(`/workspace/team/invitations/${encodeURIComponent(invitation.id)}`);
    return ok(`Revoked the invitation for ${invitation.email}. The link in their email no longer works.`, {
      email: invitation.email,
      revoked: true,
      workspace,
    });
  },
});

export const removeTeamMember = defineTool({
  name: "remove_team_member",
  title: "Remove someone from a workspace",
  description:
    "Remove a member from a workspace. They lose access to its workspace-only documents right away; documents they published stay. confirm: true records that the user confirmed removing this person. The owner can't be removed, and only the owner can remove an admin. To cancel an invitation that wasn't accepted yet, use revoke_invitation instead.",
  scope: "workspace:admin",
  annotations: DESTRUCTIVE,
  input: z.object({
    email: emailArg,
    confirm: z.boolean().describe("true when the user confirmed removing this person."),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    requireConfirm(args.confirm, `remove ${args.email} from ${workspace.name}`);
    const member = await findMember(ctx, workspace, args.email);
    if (member.role === "owner") {
      throw new UserFacingError(`${args.email} owns ${workspace.name} and can't be removed.`, "forbidden");
    }
    try {
      await ctx.api.delete(`/workspace/team/members/${encodeURIComponent(member.id)}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "forbidden") {
        throw new UserFacingError(
          "Only owners and admins can remove people, and only the owner can remove an admin.",
          "forbidden",
        );
      }
      throw err;
    }
    return ok(`Removed ${args.email} from ${workspace.name}.`, { email: args.email, removed: true, workspace });
  },
});

export const respondToInvitation = defineTool({
  name: "respond_to_invitation",
  title: "Accept or decline an invitation",
  description:
    "Accept an invitation to a workspace, join a workspace that's open to the user's email domain, or decline an invitation. get_account lists both under \"Waiting for the user\". Only call it after the user said yes (or no) to that specific workspace. Joining doesn't change where new documents go; offer set_defaults if they want to work in the new workspace.",
  scope: "docs:write",
  annotations: WRITE,
  input: z.object({
    workspace: z.string().trim().min(1).describe("The workspace's name or slug, as get_account shows it."),
    accept: z.boolean().describe("true to accept or join, false to decline."),
  }),
  async run(args, ctx) {
    const data = await ctx.api.get<MyInvitations>("/me/invitations");
    const wanted = norm(args.workspace);
    const matches = (w: { workspaceId: string; workspaceName: string; workspaceSlug: string }) =>
      w.workspaceId === args.workspace.trim() || norm(w.workspaceSlug) === wanted || norm(w.workspaceName) === wanted;
    const invitation = data.invitations.find(matches);
    const joinable = data.joinable.find(matches);

    if (!invitation && !joinable) {
      const options = [
        ...data.invitations.map((i) => `${i.workspaceName} (${i.workspaceSlug}), invitation`),
        ...data.joinable.map((j) => `${j.workspaceName} (${j.workspaceSlug}), open to @${j.domain}`),
      ];
      throw new UserFacingError(
        options.length > 0
          ? `No invitation to "${args.workspace}". Waiting for the user: ${options.join("; ")}.`
          : data.emailVerified
            ? "The user has no pending invitations and no workspaces open to their email domain."
            : `The user's email address isn't verified, so invitations can't be matched to it. They can sign in to ${new URL(config.webUrl).host} with an emailed code to verify it.`,
        "invitation_not_found",
      );
    }

    if (!args.accept) {
      if (!invitation) {
        return ok(
          `There's no invitation to decline: ${joinable!.workspaceName} is open to anyone with a verified @${joinable!.domain} email, and nothing happens unless the user joins.`,
          { declined: false, workspace: { id: joinable!.workspaceId, name: joinable!.workspaceName, slug: joinable!.workspaceSlug } },
        );
      }
      await ctx.api.post(`/invitations/${encodeURIComponent(invitation.id)}/decline`);
      return ok(`Declined the invitation to ${invitation.workspaceName}.`, {
        declined: true,
        workspace: { id: invitation.workspaceId, name: invitation.workspaceName, slug: invitation.workspaceSlug },
      });
    }

    const result = invitation
      ? await ctx.api.post<JoinResult>(`/invitations/${encodeURIComponent(invitation.id)}/accept`)
      : await ctx.api.post<JoinResult>(`/workspaces/${encodeURIComponent(joinable!.workspaceSlug)}/join`);
    return ok(
      `${result.alreadyMember ? "The user was already a member of" : "Joined"} ${result.workspace.name} (${result.workspace.slug}) as ${result.role}. New documents still go to the current default workspace; use set_defaults if the user wants to work in ${result.workspace.name}.`,
      { ...result, via: invitation ? "invitation" : "email_domain" },
    );
  },
});

export const leaveWorkspace = defineTool({
  name: "leave_workspace",
  title: "Leave a workspace",
  description:
    "Leave a workspace the user belongs to. They lose access to its documents, and getting back in needs a new invitation (or the email-domain auto-join). Owners can't leave their own workspace. confirm: true records that the user confirmed leaving this workspace.",
  scope: "docs:write",
  annotations: DESTRUCTIVE,
  input: z.object({
    workspace: z.string().trim().min(1).describe("Workspace name, slug or ID."),
    confirm: z.boolean().describe("true when the user confirmed leaving this workspace."),
  }),
  async run(args, ctx) {
    const workspace = await ctx.resolveWorkspace(args.workspace);
    requireConfirm(args.confirm, `leave ${workspace.name}`);
    if (workspace.role === "owner") {
      throw new UserFacingError(
        `The user owns ${workspace.name}, and owners can't leave their own workspace. They can transfer ownership or delete it in the dashboard instead.`,
        "owner_cannot_leave",
      );
    }
    const connection = await ctx.connection().catch(() => null);
    const result = await ctx.api.post<{
      success: boolean;
      remainingWorkspaces: Array<{ id: string; slug: string; name: string }>;
    }>("/workspace/leave", { workspaceId: workspace.id });
    const lines = [`Left ${workspace.name}.`];
    const wasDefault = connection?.workspace?.id === workspace.id;
    if (wasDefault) {
      lines.push(
        result.remainingWorkspaces.length > 0
          ? `It was this app's default workspace; new documents now go to ${result.remainingWorkspaces[0]!.name} unless the user picks another with set_defaults.`
          : "It was this app's default workspace, and the user has no other workspace now.",
      );
    }
    return ok(lines.join("\n"), {
      left: workspace,
      remainingWorkspaces: result.remainingWorkspaces,
      wasDefaultWorkspace: wasDefault,
      newDefaultWorkspace: wasDefault ? (result.remainingWorkspaces[0] ?? null) : null,
    });
  },
});

export const createWorkspace = defineTool({
  name: "create_workspace",
  title: "Create a workspace",
  description:
    "Create a new workspace, with the user as owner. Most people need only one workspace and should use projects to organise documents; create one only when the user asks for a separate workspace (another company or team). Confirm the name with the user first. The slug is the workspace's part of every document link; leave it out to derive it from the name. The user's plan can limit how many workspaces they own. This doesn't change where new documents go; use set_defaults if the user wants that.",
  scope: "workspace:admin",
  annotations: WRITE,
  input: z.object({
    name: z.string().trim().min(2).max(120),
    slug: z.string().trim().min(3).max(32).optional().describe("Lowercase letters, numbers and dashes."),
  }),
  async run(args, ctx) {
    const result = await ctx.api.post<{
      workspace: { id: string; name: string; slug: string; role: string };
      defaultProject: { id: string; name: string; slug: string } | null;
    }>("/workspaces", { name: args.name, ...(args.slug ? { slug: args.slug } : {}) });
    return ok(
      [
        `Created the workspace ${result.workspace.name}; the user is its owner. Its slug is ${result.workspace.slug}, so its document links start with ${ctx.webUrl}/${result.workspace.slug}/.`,
        "New documents still go to the current default workspace; use set_defaults if the user wants to switch, and invite_people to add their team.",
      ].join("\n"),
      {
        workspace: result.workspace,
        defaultProject: result.defaultProject,
        linkPrefix: `${ctx.webUrl}/${result.workspace.slug}/`,
        becameDefault: false,
      },
    );
  },
});

export const setAutoJoinDomains = defineTool({
  name: "set_auto_join_domains",
  title: "Set auto-join email domains",
  description:
    "Let anyone who signs in with a verified email at the company's domain join a workspace as a member without an invitation (add), or stop that (remove). An admin can only add their own email's domain (an admin at jane@acme.com can add acme.com), never personal providers like gmail.com or outlook.com. Explain this to the user and get their OK before adding a domain, since everyone at that domain can then join.",
  scope: "workspace:admin",
  annotations: WRITE,
  input: z.object({
    add: z.array(z.string().trim().min(3).max(253)).max(5).optional().describe("Domains to add, like acme.com."),
    remove: z.array(z.string().trim().min(3).max(253)).max(20).optional().describe("Domains to stop auto-join for."),
    workspace: workspaceArg,
  }),
  async run(args, ctx) {
    const clean = (d: string) => norm(d).replace(/^@/, "");
    const add = (args.add ?? []).map(clean);
    const remove = (args.remove ?? []).map(clean);
    if (add.length === 0 && remove.length === 0) {
      throw new UserFacingError("Pass add or remove with at least one domain, like acme.com.");
    }
    const workspace = await ctx.resolveWorkspace(args.workspace);
    let domains: string[] | null = null;
    const changes: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    const problems: string[] = [];
    for (const [action, list] of [
      ["add", add],
      ["remove", remove],
    ] as const) {
      for (const domain of list) {
        try {
          const result =
            action === "add"
              ? await ctx.api.post<AutoJoinDomains>("/workspace/auto-join", { workspaceId: workspace.id, domain })
              : await ctx.api.delete<AutoJoinDomains>("/workspace/auto-join", { workspaceId: workspace.id, domain });
          domains = result.domains.map((d) => d.domain);
          (action === "add" ? added : removed).push(domain);
          changes.push(
            action === "add"
              ? `Anyone with a verified @${domain} email can now join ${workspace.name} as a member.`
              : `Removed auto-join for @${domain}.`,
          );
        } catch (err) {
          if (!(err instanceof ApiError)) throw err;
          if (err.code === "domain_mismatch") {
            const yours = typeof err.body.yourDomain === "string" ? err.body.yourDomain : null;
            problems.push(
              `@${domain}: an admin can only add their own email's domain${yours ? ` (the user's is @${yours})` : ""}.`,
            );
          } else if (["consumer_domain", "invalid_domain", "email_not_verified"].includes(err.code)) {
            problems.push(`@${domain}: ${err.body.message ?? err.message}`);
          } else {
            throw err;
          }
        }
      }
    }
    if (domains === null) {
      domains = await ctx.api
        .get<AutoJoinDomains>("/workspace/auto-join", { workspaceId: workspace.id })
        .then((r) => r.domains.map((d) => d.domain))
        .catch(() => null);
    }
    const lines = [...changes, ...problems.map((p) => `Not changed: ${p}`)];
    if (domains) {
      lines.push(domains.length ? `Auto-join domains now: ${domains.map((d) => `@${d}`).join(", ")}.` : "No auto-join domains now.");
    }
    return (changes.length > 0 ? ok : fail)(lines.join("\n"), { workspace, domains, added, removed, problems });
  },
});

export const teamTools = [
  listTeam,
  invitePeople,
  changeMemberRole,
  resendInvitation,
  revokeInvitation,
  removeTeamMember,
  respondToInvitation,
  leaveWorkspace,
  createWorkspace,
  setAutoJoinDomains,
];
