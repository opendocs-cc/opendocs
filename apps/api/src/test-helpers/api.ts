import type { Express } from "express";
import request from "supertest";
import { eq } from "drizzle-orm";

type SessionAgent = ReturnType<typeof request.agent>;

type SessionUser = {
  agent: SessionAgent;
  email: string;
  password: string;
  name: string;
};

type OnboardedUser = SessionUser & {
  username: string;
  workspaceId: string;
  workspaceName: string;
  // Slug is what shows up in public URLs (opendocs.cc/<slug>/<post-slug>)
  // — kept alongside id/name because tests routinely build expected URLs.
  workspaceSlug: string;
  apiKey: string;
  userId: string;
};

let appPromise: Promise<Express> | null = null;
let sequence = 0;

function nextId(prefix: string) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

export function authHeaders(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

export async function getTestApp() {
  if (!appPromise) {
    appPromise = import("../app").then(({ createApp }) => createApp());
  }

  return appPromise;
}

export async function createSessionAgent(input?: Partial<Pick<SessionUser, "email" | "password" | "name">>) {
  const app = await getTestApp();
  const agent = request.agent(app);
  const email = input?.email ?? `${nextId("user")}@example.com`;
  const password = input?.password ?? "Password123!";
  const name = input?.name ?? `Test User ${sequence}`;

  const response = await agent
    .post("/api/auth/sign-up/email")
    .set("Accept", "application/json")
    .send({
      email,
      password,
      name,
    });

  if (response.status >= 400) {
    throw new Error(
      `Failed to create test session for ${email}: ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return { agent, email, password, name };
}

export async function createOnboardedUser(
  input?: Partial<Pick<OnboardedUser, "email" | "password" | "name" | "username" | "workspaceName">>,
) {
  const sessionUser = await createSessionAgent(input);
  const username = input?.username ?? nextId("user").replace(/-/g, "_").slice(0, 24);
  const workspaceName = input?.workspaceName ?? `Workspace ${sequence}`;

  const onboardingResponse = await sessionUser.agent.post("/api/v1/onboarding").send({
    username,
    workspaceName,
  });

  if (onboardingResponse.status !== 200) {
    throw new Error(
      `Failed to onboard ${sessionUser.email}: ${onboardingResponse.status} ${JSON.stringify(onboardingResponse.body)}`,
    );
  }

  const apiKey = onboardingResponse.body.apiKey?.plaintext as string | undefined;
  const workspaceId = onboardingResponse.body.workspace?.id as string | undefined;
  const workspaceSlug = onboardingResponse.body.workspace?.slug as string | undefined;

  if (!apiKey || !workspaceId || !workspaceSlug) {
    throw new Error(`Onboarding response is missing workspace or api key: ${JSON.stringify(onboardingResponse.body)}`);
  }

  const meResponse = await sessionUser.agent.get("/api/v1/me");
  if (meResponse.status !== 200) {
    throw new Error(`Unable to resolve onboarded user id: ${meResponse.status}`);
  }

  return {
    ...sessionUser,
    username,
    workspaceId,
    workspaceName,
    workspaceSlug,
    apiKey,
    userId: meResponse.body.userId as string,
  } satisfies OnboardedUser;
}

export async function getInvitationRecord(email: string) {
  const [{ db }, { workspaceInvitations }] = await Promise.all([
    import("@opendocs/shared/db"),
    import("@opendocs/shared/db/schema"),
  ]);

  if (!db) {
    throw new Error("Database is not initialized.");
  }

  const [record] = await db
    .select({
      id: workspaceInvitations.id,
      token: workspaceInvitations.token,
    })
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.email, email))
    .limit(1);

  if (!record) {
    throw new Error(`Invitation for ${email} was not found.`);
  }

  return record;
}
