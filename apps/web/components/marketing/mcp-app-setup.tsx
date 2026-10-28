import Link from "next/link";
import type { ReactNode } from "react";

import { AddToChatGptButton } from "@/components/add-to-chatgpt-button";
import { AddToClaudeButton } from "@/components/add-to-claude-button";
import { CodeBlock, CommandRow } from "@/components/marketing/command-row";
import type { TabItem } from "@/components/marketing/tabs";
import { findAgentLogo } from "@/lib/agent-logos";
import {
  ANTIGRAVITY_CONFIG_PATH,
  CLAUDE_CODE_ADD_COMMAND,
  CODEX_ADD_COMMAND,
  CODEX_CONFIG_TOML,
  CODEX_LOGIN_COMMAND,
  CURSOR_CONFIG_JSON,
  CURSOR_INSTALL_URL,
  GEMINI_CLI_ADD_COMMAND,
  MCP_DISPLAY_NAME,
  MCP_REMOTE_COMMAND,
  MCP_REMOTE_CONFIG_JSON,
  MCP_SERVER_URL,
  SERVER_URL_CONFIG_JSON,
  VSCODE_ADD_COMMAND,
  VSCODE_CONFIG_JSON,
  VSCODE_INSTALL_URL,
  ZED_CONFIG_JSON,
} from "@/lib/mcp";

const PRIMARY =
  "inline-flex items-center gap-2 rounded-full bg-[#6B3FC9] text-[15px] font-semibold text-white shadow-[0_10px_30px_-12px_rgba(107,63,201,0.7)] transition hover:bg-[#5B33B0] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25";
export const PRIMARY_BUTTON = `${PRIMARY} h-11 px-5`;
/** The hero-sized primary button, as on the integration pages. */
export const PRIMARY_BUTTON_LG = `${PRIMARY} h-12 px-6`;

/** The hero-sized secondary button, next to PRIMARY_BUTTON_LG. */
export const SECONDARY_BUTTON_LG =
  "inline-flex h-12 items-center gap-2 rounded-full bg-white px-6 text-[15px] font-semibold text-zinc-900 ring-1 ring-zinc-900/15 transition hover:ring-zinc-900/30 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#6B3FC9]/25";

const TEXT_LINK = "font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900";

/** An app's mark from Simple Icons, or its initial when there isn't one. */
export function AppMark({ name, logo, size = "lg" }: { name: string; logo?: string; size?: "lg" | "sm" }) {
  const mark = findAgentLogo(logo);
  const box = size === "lg" ? "h-12 w-12 rounded-2xl" : "h-9 w-9 rounded-xl";
  const icon = size === "lg" ? "h-6 w-6" : "h-[18px] w-[18px]";
  return (
    <span
      aria-hidden="true"
      className={`inline-flex flex-none items-center justify-center bg-white text-zinc-800 ring-1 ring-zinc-900/[0.08] ${box}`}
    >
      {mark ? (
        <svg viewBox="0 0 24 24" className={`${icon} fill-current`}>
          <path d={mark.path} />
        </svg>
      ) : (
        <span className={size === "lg" ? "text-lg font-semibold" : "text-sm font-semibold"}>{name.charAt(0)}</span>
      )}
    </span>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono text-[0.9em] text-zinc-800">{children}</code>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 sm:gap-4">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#F4F0FD] text-sm font-semibold text-[#5B33B0]">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h4 className="font-semibold text-zinc-950">{title}</h4>
        <div className="mt-1.5 space-y-3 leading-relaxed text-zinc-600">{children}</div>
      </div>
    </li>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="text-[15px] font-semibold text-zinc-950">{title}</h4>
      <div className="mt-1.5 space-y-3 text-[15px] leading-relaxed text-zinc-600">{children}</div>
    </div>
  );
}

function SkillLink({ href, name }: { href: string; name: string }) {
  return (
    <Note title="Working with local files?">
      <p>
        {name} can also use the OpenDocs skill and CLI, which handle local files, folders and images
        better.{" "}
        <Link href={href} className={TEXT_LINK}>
          Set up the skill
        </Link>
      </p>
    </Note>
  );
}

/** One app's tab: its name, numbered steps, and notes on the side. */
function AppPanel({
  name,
  logo,
  detail,
  steps,
  notes,
}: {
  name: string;
  logo?: string;
  detail: string;
  steps: ReactNode;
  notes: ReactNode;
}) {
  return (
    <div className="rounded-[28px] bg-white p-5 ring-1 ring-zinc-900/[0.06] sm:p-9">
      <div className="flex items-center gap-4">
        <AppMark name={name} logo={logo} />
        <div className="min-w-0">
          <h3 className="text-xl font-semibold tracking-[-0.015em] text-zinc-950">{name}</h3>
          <p className="mt-0.5 text-[15px] text-zinc-500">{detail}</p>
        </div>
      </div>
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:gap-12">
        <ol className="space-y-7">{steps}</ol>
        <div className="space-y-6 rounded-2xl bg-zinc-50 p-5 sm:p-6">{notes}</div>
      </div>
    </div>
  );
}

const ClaudePanel = (
  <AppPanel
    name="Claude"
    logo="claude"
    detail="Web, desktop and mobile"
    steps={
      <>
        <Step n={1} title="Add the connector">
          <p>
            Click <strong className="font-semibold text-zinc-900">Add to Claude</strong>. Claude opens its Add
            custom connector dialog with the name and URL filled in. Click <strong className="font-semibold text-zinc-900">Add</strong>.
          </p>
          <div>
            <AddToClaudeButton className={PRIMARY_BUTTON} />
          </div>
        </Step>
        <Step n={2} title="Connect and sign in">
          <p>
            Click <strong className="font-semibold text-zinc-900">Connect</strong> next to {MCP_DISPLAY_NAME}. Sign
            in with your OpenDocs account (an emailed code, Google or GitHub), choose what Claude may do and
            click <strong className="font-semibold text-zinc-900">Allow</strong>.
          </p>
        </Step>
        <Step n={3} title="Ask">
          <p>
            Ask in any chat. Once it&apos;s added on claude.ai, OpenDocs works in Claude on the web, the desktop
            app and the mobile app.
          </p>
        </Step>
      </>
    }
    notes={
      <>
        <Note title="Team and Enterprise">
          <p>An owner adds OpenDocs once in Organization settings → Connectors. Then everyone clicks Connect.</p>
          <p>
            <AddToClaudeButton
              admin
              label="Add it for your organization"
              iconClassName="h-4 w-4"
              className="inline-flex items-center gap-2 font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-900"
            />
          </p>
        </Note>
        <Note title="Claude Free">
          <p>The Free plan allows one custom connector.</p>
        </Note>
        <Note title="Add it by hand">
          <p>
            In Claude&apos;s connector settings, choose Add custom connector, name it {MCP_DISPLAY_NAME} and paste
            this URL:
          </p>
          <CommandRow command={MCP_SERVER_URL} />
        </Note>
      </>
    }
  />
);

const ChatGptPanel = (
  <AppPanel
    name="ChatGPT"
    detail="From ChatGPT's plugin directory"
    steps={
      <>
        <Step n={1} title="Install the plugin">
          <p>
            Click <strong className="font-semibold text-zinc-900">Add to ChatGPT</strong>. ChatGPT opens{" "}
            {MCP_DISPLAY_NAME} in its plugin directory. Click{" "}
            <strong className="font-semibold text-zinc-900">Install plugin</strong>.
          </p>
          <div>
            <AddToChatGptButton className={PRIMARY_BUTTON} />
          </div>
        </Step>
        <Step n={2} title="Sign in and allow">
          <p>
            ChatGPT opens OpenDocs. Sign in with your OpenDocs account (an emailed code, Google or GitHub), choose
            what ChatGPT may do and click <strong className="font-semibold text-zinc-900">Allow</strong>.
          </p>
        </Step>
        <Step n={3} title="Ask">
          <p>Ask in any chat. If ChatGPT doesn&apos;t use OpenDocs on its own, mention it: &ldquo;Publish this with OpenDocs.&rdquo;</p>
        </Step>
      </>
    }
    notes={
      <>
        <Note title="Work account?">
          <p>Your ChatGPT admin may need to allow {MCP_DISPLAY_NAME} first.</p>
        </Note>
        <Note title="Add it by hand">
          <p>
            In ChatGPT&apos;s Settings → Plugins, click + and choose Add custom MCP server. Name it{" "}
            {MCP_DISPLAY_NAME}, paste this URL and choose OAuth:
          </p>
          <CommandRow command={MCP_SERVER_URL} />
        </Note>
        <Note title="Using Codex?">
          <p>
            Codex has its own setup.{" "}
            <a href="#codex" className={TEXT_LINK}>
              See the Codex tab
            </a>
          </p>
        </Note>
      </>
    }
  />
);

const ClaudeCodePanel = (
  <AppPanel
    name="Claude Code"
    logo="claude"
    detail="In the terminal and your editor"
    steps={
      <>
        <Step n={1} title="Add the server">
          <CommandRow command={CLAUDE_CODE_ADD_COMMAND} />
          <p>
            <Kbd>--scope user</Kbd> makes it available in every project.
          </p>
        </Step>
        <Step n={2} title="Sign in">
          <p>
            In Claude Code, run <Kbd>/mcp</Kbd>, choose <Kbd>opendocs</Kbd> and sign in to OpenDocs in the
            browser that opens.
          </p>
        </Step>
        <Step n={3} title="Ask">
          <p>Ask Claude Code to publish, export or share a document.</p>
        </Step>
      </>
    }
    notes={
      <>
        <Note title="Added it on claude.ai?">
          <p>
            Connectors you add on claude.ai also show up in Claude Code when you&apos;re signed in with the same
            account, so you can skip step 1.
          </p>
        </Note>
        <SkillLink href="/integrations/claude-code" name="Claude Code" />
      </>
    }
  />
);

const CodexPanel = (
  <AppPanel
    name="Codex"
    detail="CLI, IDE extension and the ChatGPT desktop app"
    steps={
      <>
        <Step n={1} title="Add the server">
          <CommandRow command={CODEX_ADD_COMMAND} />
        </Step>
        <Step n={2} title="Sign in">
          <CommandRow command={CODEX_LOGIN_COMMAND} />
          <p>Your browser opens OpenDocs. Sign in and click Allow.</p>
        </Step>
        <Step n={3} title="Ask">
          <p>Ask Codex to publish, export or share a document.</p>
        </Step>
      </>
    }
    notes={
      <>
        <Note title="One setup for all of Codex">
          <p>The Codex CLI, the IDE extension and the ChatGPT desktop app share this configuration.</p>
        </Note>
        <Note title="Or edit config.toml">
          <CodeBlock label="~/.codex/config.toml" code={CODEX_CONFIG_TOML} />
          <p>Then sign in with step 2.</p>
        </Note>
        <SkillLink href="/integrations/codex" name="Codex" />
      </>
    }
  />
);

const CursorPanel = (
  <AppPanel
    name="Cursor"
    logo="cursor"
    detail="Agent chat in the editor"
    steps={
      <>
        <Step n={1} title="Install">
          <p>
            Cursor opens and shows the server. Click <strong className="font-semibold text-zinc-900">Install</strong>.
          </p>
          <div>
            <a href={CURSOR_INSTALL_URL} className={PRIMARY_BUTTON}>
              Add to Cursor
            </a>
          </div>
        </Step>
        <Step n={2} title="Sign in">
          <p>
            In Cursor&apos;s MCP settings, opendocs asks you to sign in. Click it and allow access in the browser
            that opens.
          </p>
        </Step>
        <Step n={3} title="Ask">
          <p>Ask the agent to publish, export or share a document.</p>
        </Step>
      </>
    }
    notes={
      <>
        <Note title="Or edit mcp.json">
          <CodeBlock label="~/.cursor/mcp.json" code={CURSOR_CONFIG_JSON} />
          <p>
            Already have servers there? Add the <Kbd>opendocs</Kbd> entry inside <Kbd>mcpServers</Kbd>.
          </p>
        </Note>
        <SkillLink href="/integrations/cursor" name="Cursor" />
      </>
    }
  />
);

const VsCodePanel = (
  <AppPanel
    name="VS Code"
    detail="GitHub Copilot in agent mode"
    steps={
      <>
        <Step n={1} title="Install">
          <div>
            <a href={VSCODE_INSTALL_URL} className={PRIMARY_BUTTON}>
              Install in VS Code
            </a>
          </div>
          <p>Or run:</p>
          <CommandRow command={VSCODE_ADD_COMMAND} />
        </Step>
        <Step n={2} title="Start and sign in">
          <p>VS Code asks you to start the server, then opens your browser to sign in to OpenDocs and allow.</p>
        </Step>
        <Step n={3} title="Ask Copilot">
          <p>In Copilot Chat, switch to agent mode and ask it to publish, export or share a document.</p>
        </Step>
      </>
    }
    notes={
      <>
        <Note title="Or edit mcp.json">
          <CodeBlock label="mcp.json" code={VSCODE_CONFIG_JSON} />
          <p>
            Open it with <Kbd>MCP: Open User Configuration</Kbd> in the Command Palette, or use{" "}
            <Kbd>.vscode/mcp.json</Kbd> to share it with a project.
          </p>
        </Note>
        <SkillLink href="/integrations/copilot" name="Copilot" />
      </>
    }
  />
);

function MoreApp({ name, logo, children }: { name: string; logo?: string; children: ReactNode }) {
  return (
    <li className="flex min-w-0 flex-col rounded-3xl bg-white p-5 ring-1 ring-zinc-900/[0.06] sm:p-6">
      <div className="flex items-center gap-3">
        <AppMark name={name} logo={logo} size="sm" />
        <h3 className="font-semibold text-zinc-950">{name}</h3>
      </div>
      <div className="mt-4 space-y-3 text-[15px] leading-relaxed text-zinc-600">{children}</div>
    </li>
  );
}

const MorePanel = (
  <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
    <MoreApp name="Windsurf (Devin Desktop)" logo="windsurf">
      <p>
        Add this to its MCP config, <Kbd>mcp_config.json</Kbd>:
      </p>
      <CodeBlock label="mcp_config.json" code={SERVER_URL_CONFIG_JSON} />
    </MoreApp>
    <MoreApp name="Antigravity">
      <p>The same config goes in Antigravity&apos;s MCP file:</p>
      <CodeBlock label={ANTIGRAVITY_CONFIG_PATH} code={SERVER_URL_CONFIG_JSON} />
      <p>Still on Gemini CLI? Run:</p>
      <CommandRow command={GEMINI_CLI_ADD_COMMAND} />
    </MoreApp>
    <MoreApp name="Zed" logo="zed">
      <p>
        Add this to your Zed <Kbd>settings.json</Kbd>:
      </p>
      <CodeBlock label="settings.json" code={ZED_CONFIG_JSON} />
    </MoreApp>
    <MoreApp name="JetBrains AI Assistant" logo="jetbrains">
      <p>
        In AI Assistant&apos;s MCP settings, add a server with this JSON. It runs <Kbd>mcp-remote</Kbd> (Node.js),
        which signs you in through your browser.
      </p>
      <CodeBlock label="MCP server JSON" code={MCP_REMOTE_CONFIG_JSON} />
    </MoreApp>
    <MoreApp name="Raycast" logo="raycast">
      <p>
        Run the <strong className="font-semibold text-zinc-900">Install MCP Server</strong> command, name it{" "}
        <Kbd>opendocs</Kbd> and paste the URL:
      </p>
      <CommandRow command={MCP_SERVER_URL} />
    </MoreApp>
    <MoreApp name="Any other app">
      <p>Add a remote MCP server with this URL and sign in when the app asks:</p>
      <CommandRow command={MCP_SERVER_URL} />
      <p>Apps that only run local servers can connect through mcp-remote:</p>
      <CommandRow command={MCP_REMOTE_COMMAND} />
    </MoreApp>
  </ul>
);

/** The "Pick your app" tabs on /mcp. Ids double as URL hashes (/mcp#cursor). */
export const MCP_APP_TABS: readonly TabItem[] = [
  { id: "claude", label: "Claude", content: ClaudePanel },
  { id: "chatgpt", label: "ChatGPT", content: ChatGptPanel },
  { id: "claude-code", label: "Claude Code", content: ClaudeCodePanel },
  { id: "codex", label: "Codex", content: CodexPanel },
  { id: "cursor", label: "Cursor", content: CursorPanel },
  { id: "vscode", label: "VS Code", content: VsCodePanel },
  { id: "more", label: "More apps", content: MorePanel },
];
