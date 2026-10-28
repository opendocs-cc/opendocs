/**
 * The one-step start: paste this into Claude Code, Cursor, Codex, etc. The
 * agent installs the OpenDocs skill (via `npx skills` when Node is around,
 * otherwise install.sh), signs the person up or in with an emailed code,
 * reads the agent quickstart and asks what to publish.
 *
 * Signed-in people (the dashboard) get a version with their own email and
 * active workspace filled in, so the agent signs them in instead of asking.
 *
 * The docs show the signed-out version word for word, in
 * apps/docs/docs/index.mdx and apps/docs/docs/getting-started/quickstart.md.
 * Change them together. A self-hosted instance's prompt points at its own
 * addresses (withInstanceUrls).
 */

import { withInstanceUrls } from "@opendocs/shared/config/instance";

export function agentSetupPrompt(account?: {
  email: string;
  workspaceSlug?: string;
  workspaceName?: string;
}) {
  let signIn =
    "Then sign me up (it's free): ask for my email, run opendocs login --email <my email>, and I'll paste the 6-digit code it sends me.";
  if (account) {
    signIn = `Then sign me in: run opendocs login --email ${account.email} and I'll paste the 6-digit code it sends me.`;
    if (account.workspaceSlug) {
      signIn += ` Once I'm signed in, switch to my ${account.workspaceName ?? account.workspaceSlug} workspace with opendocs workspace use ${account.workspaceSlug}.`;
    }
  }

  return withInstanceUrls([
    "I'd like you to set up OpenDocs: Markdown publishing for agents (shareable links, plus PDF and DOCX export).",
    "Install as a skill if I have npm: npx skills add opendocs-cc/skills --skill opendocs -g -y",
    "If not, do this instead: curl -fsSL https://opendocs.cc/install.sh | bash",
    'The npx installer may end with "PromptScript does not support global skill installation". That\'s a known installer bug that only affects PromptScript; the skill is still installed.',
    signIn,
    "After that, read the agent quickstart at https://docs.opendocs.cc/getting-started/agent-quickstart.md and ask me what I'd like to publish",
  ].join("\n\n"));
}

export const AGENT_SETUP_PROMPT = agentSetupPrompt();
