import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { MarketingCta } from "@/components/marketing/marketing-cta";
import { getServerSession } from "@/lib/auth/session";
import { buildPageMetadata } from "@/lib/metadata";

import "../landing.css";
import "./faq.css";

export const metadata = buildPageMetadata({
  title: "FAQ",
  description:
    "Answers to common questions about publishing Markdown with OpenDocs: plans, exports, CLI usage, and AI-agent integrations.",
  url: "https://opendocs.cc/faq",
});

const GROUPS = [
  { id: "basics", title: "The basics" },
  { id: "agents", title: "Agents and the CLI" },
  { id: "plans", title: "Plans and exports" },
] as const;

const faqs: { group: (typeof GROUPS)[number]["id"]; q: string; a: string }[] = [
  {
    group: "basics",
    q: "What problem does OpenDocs solve?",
    a: 'In AI workflows you end up with a lot of .md files: architecture docs, changelogs, specs, runbooks. But sharing them is a pain. You either tell your team "open this file in Obsidian" or push to a repo and hope they find it. When you\'re moving fast, that friction kills momentum. OpenDocs lets you publish any Markdown file to a shareable URL in seconds, straight from the terminal or via your AI agent of choice.',
  },
  {
    group: "basics",
    q: "How does it work?",
    a: "Tell your agent to publish a Markdown file. It runs <code>opendocs publish doc.md</code> and you get a clean, readable URL like <code>opendocs.cc/you/doc-name</code> that your team can open in a browser. No git push, no deploy pipeline, no wiki to maintain. Signing up happens in the terminal too: <code>opendocs login --email you@example.com</code> emails you a 6-digit code, and pasting it creates your account and workspace. Publishing the same file again updates the same link.",
  },
  {
    group: "basics",
    q: "Who can see my documents?",
    a: "By default, documents are <strong>workspace-visible</strong>, meaning only members of your workspace can view them. This is the safe default for internal notes, specs, and drafts. If you want to share a document publicly (anyone with the link can read it), you explicitly set <code>--visibility public</code>. You're always in control.",
  },
  {
    group: "agents",
    q: "Does it work with AI coding tools?",
    a: "Absolutely, that's what it's built for. Claude Code, Cursor, GitHub Copilot, Cline, Aider, Hermes Agent, Codex, OpenClaw, and any tool that can run terminal commands can publish to OpenDocs. The agent writes a Markdown file, runs the CLI, and hands you the link. The <code>--json</code> flag makes it easy for agents to parse the output programmatically.",
  },
  {
    group: "agents",
    q: "Can I use OpenDocs from Claude or ChatGPT?",
    a: "Yes, through the OpenDocs MCP server at <code>https://mcp.opendocs.cc/mcp</code>. Add it as a connector in Claude (web, desktop and mobile) or install OpenDocs.cc from ChatGPT's plugin directory, sign in with your OpenDocs account and choose what the app may do. Then ask in plain words: \"Publish this as a doc in our Legal project\" or \"Make a PDF of the Acme NDA\". It also works in Claude Code, Codex, Cursor, VS Code and other MCP apps, on every plan including Free. See <a href=\"/mcp\">the setup page</a> for each app's steps; you can disconnect any time in Dashboard → Connected apps.",
  },
  {
    group: "agents",
    q: "How do I teach my AI agent to use OpenDocs?",
    a: "Click <strong>Copy prompt for agent</strong> on the homepage and paste it into your agent. With npm it runs <code>npx skills add opendocs-cc/skills --skill opendocs -g -y</code>; without Node.js it runs <code>curl -fsSL https://opendocs.cc/install.sh | bash</code>. Both install the OpenDocs <a href=\"https://opendocs.cc/skill.md\">SKILL.md</a> (if <code>npx skills add</code> ends with a PromptScript error about global installs, that's a known installer bug and the skill is still installed), which teaches the agent to sign you up, publish, update, share and export. It works with Claude Code, Codex, Cursor, OpenClaw, Hermes Agent and any agent that supports skill files.",
  },
  {
    group: "agents",
    q: "I'm an agent, what should I do first?",
    a: "Install the OpenDocs skill: <code>npx skills add opendocs-cc/skills --skill opendocs -g -y</code>. If you don't have npm, run <code>curl -fsSL https://opendocs.cc/install.sh | bash</code>. If the npx installer ends with \"PromptScript does not support global skill installation\", ignore it: that's a known installer bug and the skill is installed. Then read the agent quickstart at <code>https://docs.opendocs.cc/getting-started/agent-quickstart.md</code> and ask the user what they'd like to publish.",
  },
  {
    group: "basics",
    q: "Can I publish without an account?",
    a: "For a quick link, yes: <code>opendocs publish notes.md --anonymous</code> gives you a link anyone can open for 24 hours, plus a claim link. To keep it, sign up (or open the claim link) within 24 hours; otherwise it's deleted. Signing up is free for up to 50 documents and takes a minute from the terminal, and an account keeps documents private to your workspace, lets you update them at the same link and adds PDF export.",
  },
  {
    group: "plans",
    q: "What's the difference between Free, Pro, and Team?",
    a: "<strong>Free ($0)</strong> gives you 50 published documents, 1 workspace with up to 3 members, public publishing, PDF export with your own logo, colors and fonts (plus a small \"Made with OpenDocs\" footer), API keys, and the CLI. <strong>Pro ($8/month, or $6 billed yearly)</strong> unlocks unlimited documents, 2 workspaces with up to 5 members each, Word (.docx) export, your own export footer, Google Drive and e-signatures, and a custom domain for each workspace (like notes.yourcompany.com). <strong>Team ($4/user/month, 3-seat minimum, or $3 billed yearly)</strong> adds unlimited workspaces and members, one bill for the whole team, and priority support. API access, the CLI, and public publishing are on every plan.",
  },
  {
    group: "plans",
    q: "Can documents live on my own domain?",
    a: "Yes, on Pro and Team. Each workspace can connect a subdomain such as notes.yourcompany.com: add two DNS records in Workspace settings (or copy a prompt that has your AI agent add them), and its documents, projects and workspace page are served there over HTTPS, with opendocs.cc links redirecting to it. Hide the one \"Published with OpenDocs\" line for a white-label site. See <a href=\"https://docs.opendocs.cc/publishing/custom-domains\">Custom domains</a>.",
  },
  {
    group: "plans",
    q: "Can I export my documents to PDF or Word?",
    a: "Yes. Run <code>opendocs export my-doc -f pdf</code> to get a formatted PDF, or <code>-f docx</code> for an editable Word document. You can also customize the output with <code>--landscape</code> for landscape orientation and <code>--accent-color</code> to match your brand. The exported files are print-ready with proper typography and formatting. AI agents that use the <a href=\"https://opendocs.cc/skill.md\">SKILL.md</a> can handle exports for you too. Just ask your agent to export a doc to PDF.",
  },
  {
    group: "plans",
    q: "Can I export multiple documents at once?",
    a: "Absolutely. Pass multiple slugs or IDs to the export command: <code>opendocs export doc-1 doc-2 doc-3 -f pdf</code>. Batch exports support up to 10 documents at once and deliver them as a zip file. Use <code>-o ./exports</code> to specify an output directory.",
  },
  {
    group: "agents",
    q: "Can I update a document after publishing?",
    a: "Yes. Edit the file and publish it again: OpenDocs remembers which file is which document, so you get a new version at the same URL instead of a copy. If a teammate published a newer version in the meantime, you get a conflict warning instead of overwriting their work. <code>opendocs history doc.md</code> lists every version and <code>opendocs rollback doc.md 2</code> brings an old one back.",
  },
  {
    group: "basics",
    q: "Do readers need an OpenDocs account?",
    a: "Not for public documents or anonymous 24-hour links. Workspace documents are for members of your workspace. To send one document to someone outside your team (a client, a contractor), share it with their email: <code>opendocs share doc.md sam@acme.com</code>. They sign in with that email using a one-time code and can read only what you shared.",
  },
  {
    group: "agents",
    q: "Can I pull a document back to edit it locally?",
    a: "Yes. <code>opendocs pull &lt;doc&gt;</code> downloads the Markdown, and <code>opendocs clone</code> downloads a whole workspace into a folder. Edit the files, run <code>opendocs status</code> to see what changed, and <code>opendocs publish .</code> to publish the changes to the same links.",
  },
  {
    group: "plans",
    q: "What happens to my documents if I cancel Pro or Team?",
    a: "Your account reverts to Free at the end of the billing period. If you have more than 50 published documents, they all stay live and readable. You just can't publish new ones until you're under the limit or upgrade again. Word exports stop being available, and new PDFs start carrying the \"Made with OpenDocs\" footer again. Nothing gets deleted.",
  },
  {
    group: "basics",
    q: "Is OpenDocs open source?",
    a: 'Yes. All of OpenDocs is open source under the MIT license: the web app, API, MCP server, document converter, CLI, browser extension and agent skills. It\'s on <a href="https://github.com/opendocs-cc">GitHub</a>, and you can <a href="https://github.com/opendocs-cc/opendocs/blob/main/SELF_HOSTING.md">host it yourself</a>.',
  },
];

export default async function FaqPage() {
  const session = await getServerSession();

  return (
    <div className="lp">
      <LandingNav active="faq" authenticated={Boolean(session)} />

      <main className="mk-page">
        <div className="faq-layout">
          <header className="faq-intro">
            <p className="faq-intro__eyebrow">FAQ</p>
            <h1 className="faq-intro__title">Questions, answered</h1>
            <p className="faq-intro__subtitle">
              Publishing, sharing and exporting Markdown with OpenDocs, and how agents fit in.
            </p>
            <nav className="faq-intro__nav" aria-label="FAQ sections">
              {GROUPS.map((group) => (
                <a key={group.id} href={`#${group.id}`}>
                  {group.title}
                </a>
              ))}
            </nav>
            <p className="faq-intro__more">
              Not here? Try the{" "}
              <a href="https://docs.opendocs.cc">docs</a> or{" "}
              <a href="mailto:hello@opendocs.cc">email us</a>.
            </p>
          </header>

          <div className="faq-groups">
            {GROUPS.map((group) => (
              <section key={group.id} id={group.id} className="faq-group">
                <h2 className="faq-group__title">{group.title}</h2>
                <dl>
                  {faqs
                    .filter((item) => item.group === group.id)
                    .map((item) => (
                      <div key={item.q} className="faq-item">
                        <dt className="faq-item__q">{item.q}</dt>
                        <dd
                          className="faq-item__a"
                          dangerouslySetInnerHTML={{ __html: item.a }}
                        />
                      </div>
                    ))}
                </dl>
              </section>
            ))}
          </div>
        </div>

        <MarketingCta
          title="Try it on one document"
          text="Paste the setup prompt into your agent, then ask it to publish a Markdown file. You'll have a link in under a minute."
        />
      </main>

      <LandingFooter />
    </div>
  );
}
