import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { createOnboardedUser, createSessionAgent, getInvitationRecord } from "../test-helpers/api";

async function setUserPlan(userId: string, plan: "free" | "pro") {
  const [{ db }, { user }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  await db.update(user).set({ plan }).where(eq(user.id, userId));
}

async function insertTeamSubscription(input: { userId: string; seats: number }) {
  const [{ db }, { subscriptions }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);
  if (!db) throw new Error("Database is not initialized.");
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await db.insert(subscriptions).values({
    userId: input.userId,
    workspaceId: null,
    plan: "team",
    paddleCustomerId: `ctm_${suffix}`,
    paddleSubscriptionId: `sub_${suffix}`,
    paddlePriceId: `pri_team_${suffix}`,
    billingCycle: "monthly",
    status: "active",
    seats: input.seats,
    extraWorkspaces: 0,
  });
}

describe("team routes", () => {
  it("allows Pro workspaces up to 5 members including the owner", async () => {
    const owner = await createOnboardedUser();
    await setUserPlan(owner.userId, "pro");

    const invitees = await Promise.all(
      Array.from({ length: 5 }, () => createSessionAgent()),
    );

    for (const invitee of invitees.slice(0, 4)) {
      const invite = await owner.agent.post("/api/v1/workspace/team/invite").send({
        workspaceId: owner.workspaceId,
        email: invitee.email,
        role: "member",
      });
      expect(invite.status).toBe(201);
    }

    const overflow = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: invitees[4]!.email,
      role: "member",
    });
    expect(overflow.status).toBe(403);
    expect(overflow.body).toMatchObject({
      error: "member_limit",
      plan: "pro",
      limit: 5,
    });
  });

  it("only lets the invited email address accept an invitation token", async () => {
    const owner = await createOnboardedUser();
    const invitedUser = await createSessionAgent();
    const otherUser = await createSessionAgent();

    const invited = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: invitedUser.email,
      role: "member",
    });
    expect(invited.status).toBe(201);

    const invitationRecord = await getInvitationRecord(invitedUser.email);
    const { getInvitationLandingState } = await import("@opendocs/shared/workspaces/service");
    await expect(getInvitationLandingState(invitationRecord.token)).resolves.toMatchObject({
      status: "valid",
      email: invitedUser.email,
      existingUser: true,
      workspaceName: owner.workspaceName,
    });

    const stolenToken = await otherUser.agent
      .post("/api/v1/workspace/team/accept-invite")
      .send({ token: invitationRecord.token });
    expect(stolenToken.status).toBe(403);
    expect(stolenToken.body).toMatchObject({ error: "forbidden" });

    const accepted = await invitedUser.agent
      .post("/api/v1/workspace/team/accept-invite")
      .send({ token: invitationRecord.token });
    expect(accepted.status).toBe(200);
    expect(accepted.body.role).toBe("member");
  });

  it("refreshes an expired invitation instead of failing on the unique workspace/email constraint", async () => {
    const owner = await createOnboardedUser();
    const member = await createSessionAgent();

    const firstInvite = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: member.email.toUpperCase(),
      role: "member",
    });
    expect(firstInvite.status).toBe(201);
    expect(firstInvite.body.invitation.email).toBe(member.email);

    const firstRecord = await getInvitationRecord(member.email);
    const [{ db }, { workspaceInvitations }] = await Promise.all([
      import("@opendocs/shared/db"),
      import("@opendocs/shared/db/schema"),
    ]);
    if (!db) throw new Error("Database is not initialized.");

    await db
      .update(workspaceInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(workspaceInvitations.id, firstRecord.id));

    const secondInvite = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: member.email,
      role: "admin",
    });
    expect(secondInvite.status).toBe(201);
    expect(secondInvite.body.invitation.id).toBe(firstRecord.id);
    expect(secondInvite.body.invitation.role).toBe("admin");

    const refreshedRecord = await getInvitationRecord(member.email);
    expect(refreshedRecord.token).not.toBe(firstRecord.token);
  });

  it("does not activate a new unique Team member if the required Paddle seat increase fails", async () => {
    const owner = await createOnboardedUser();
    const member = await createSessionAgent();
    await insertTeamSubscription({ userId: owner.userId, seats: 1 });

    const invited = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: member.email,
      role: "member",
    });
    expect(invited.status).toBe(201);

    const invitationRecord = await getInvitationRecord(member.email);
    const accepted = await member.agent
      .post("/api/v1/workspace/team/accept-invite")
      .send({ token: invitationRecord.token });

    expect(accepted.status).toBe(402);
    expect(accepted.body).toMatchObject({ error: "billing_failed" });

    const team = await owner.agent.get(
      `/api/v1/workspace/team?workspaceId=${owner.workspaceId}`,
    );
    expect(team.status).toBe(200);
    expect(team.body.members).toHaveLength(1);
  });

  it("covers the invitation lifecycle, role changes, and removal", async () => {
    const owner = await createOnboardedUser();
    const member = await createSessionAgent();

    const teamQuery = `workspaceId=${owner.workspaceId}`;

    const initialTeam = await owner.agent.get(`/api/v1/workspace/team?${teamQuery}`);
    const initialStats = await owner.agent.get(`/api/v1/workspace/team/stats?${teamQuery}`);
    const initialInvitations = await owner.agent.get(`/api/v1/workspace/team/invitations?${teamQuery}`);
    const missingWorkspaceIdTeam = await owner.agent.get("/api/v1/workspace/team");

    expect(initialTeam.status).toBe(200);
    expect(initialTeam.body.members).toHaveLength(1);
    expect(initialStats.status).toBe(200);
    expect(initialStats.body.totalMembers).toBe(1);
    expect(initialInvitations.status).toBe(200);
    expect(initialInvitations.body.invitations).toEqual([]);
    expect(missingWorkspaceIdTeam.status).toBe(400);
    expect(missingWorkspaceIdTeam.body).toMatchObject({ error: "missing_workspace_id" });

    const invalidInvite = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: "not-an-email",
      role: "member",
    });
    const missingWorkspaceIdInvite = await owner.agent.post("/api/v1/workspace/team/invite").send({
      email: member.email,
      role: "member",
    });
    const invited = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: member.email,
      role: "member",
    });
    const duplicateInvite = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: member.email,
      role: "member",
    });

    expect(invalidInvite.status).toBe(400);
    expect(invalidInvite.body.error).toBe("invalid_request");
    expect(missingWorkspaceIdInvite.status).toBe(400);
    expect(missingWorkspaceIdInvite.body.error).toBe("invalid_request");
    expect(invited.status).toBe(201);
    expect(invited.body.invitation.email).toBe(member.email);
    expect(duplicateInvite.status).toBe(409);

    const invitationRecord = await getInvitationRecord(member.email);

    const listInvitations = await owner.agent.get(`/api/v1/workspace/team/invitations?${teamQuery}`);
    const teamStatsWithInvite = await owner.agent.get(`/api/v1/workspace/team/stats?${teamQuery}`);
    const resend = await owner.agent.post(`/api/v1/workspace/team/invitations/${invitationRecord.id}/resend`);
    const missingResend = await owner.agent.post("/api/v1/workspace/team/invitations/not-a-real-id/resend");

    expect(listInvitations.status).toBe(200);
    expect(listInvitations.body.invitations).toHaveLength(1);
    expect(teamStatsWithInvite.status).toBe(200);
    expect(teamStatsWithInvite.body.pendingInvites).toBe(1);
    expect(resend.status).toBe(200);
    expect(resend.body).toEqual({ success: true });
    expect(missingResend.status).toBe(404);
    expect(missingResend.body).toMatchObject({ error: "not_found" });

    const accepted = await member.agent.post("/api/v1/workspace/team/accept-invite").send({
      token: invitationRecord.token,
    });
    const reusedToken = await member.agent.post("/api/v1/workspace/team/accept-invite").send({
      token: invitationRecord.token,
    });

    expect(accepted.status).toBe(200);
    expect(accepted.body.role).toBe("member");
    expect(reusedToken.status).toBe(404);
    expect(reusedToken.body).toMatchObject({ error: "not_found" });

    const memberInvitations = await member.agent.get(`/api/v1/workspace/team/invitations?${teamQuery}`);
    const teamAfterAccept = await owner.agent.get(`/api/v1/workspace/team?${teamQuery}`);
    const statsAfterAccept = await owner.agent.get(`/api/v1/workspace/team/stats?${teamQuery}`);

    expect(memberInvitations.status).toBe(403);
    expect(memberInvitations.body).toMatchObject({ error: "forbidden" });
    expect(teamAfterAccept.status).toBe(200);
    expect(teamAfterAccept.body.members).toHaveLength(2);
    expect(statsAfterAccept.status).toBe(200);
    expect(statsAfterAccept.body.totalMembers).toBe(2);

    const targetMember = teamAfterAccept.body.members.find(
      (entry: { email: string }) => entry.email === member.email,
    );

    expect(targetMember).toBeTruthy();

    const promote = await owner.agent.patch(`/api/v1/workspace/team/members/${targetMember.id}/role`).send({
      role: "admin",
    });
    const missingPromotion = await owner.agent.patch("/api/v1/workspace/team/members/not-a-real-id/role").send({
      role: "admin",
    });

    expect(promote.status).toBe(200);
    expect(promote.body.member.role).toBe("admin");
    expect(missingPromotion.status).toBe(404);
    expect(missingPromotion.body).toMatchObject({ error: "not_found" });

    const remove = await owner.agent.delete(`/api/v1/workspace/team/members/${targetMember.id}`);
    const missingRemove = await owner.agent.delete("/api/v1/workspace/team/members/not-a-real-id");

    expect(remove.status).toBe(200);
    expect(remove.body).toEqual({ success: true });
    expect(missingRemove.status).toBe(404);
    expect(missingRemove.body).toMatchObject({ error: "not_found" });

    const inviteForCancel = await owner.agent.post("/api/v1/workspace/team/invite").send({
      workspaceId: owner.workspaceId,
      email: "pending-cancel@example.com",
      role: "member",
    });

    expect(inviteForCancel.status).toBe(201);

    const cancel = await owner.agent.delete(`/api/v1/workspace/team/invitations/${inviteForCancel.body.invitation.id}`);
    const missingCancel = await owner.agent.delete("/api/v1/workspace/team/invitations/not-a-real-id");

    expect(cancel.status).toBe(200);
    expect(cancel.body).toEqual({ success: true });
    expect(missingCancel.status).toBe(404);
    expect(missingCancel.body).toMatchObject({ error: "not_found" });
  });
});
