import Link from "next/link";

import { CookieSettingsButton } from "@/components/cookie-banner";
import { SELF_HOSTING_GUIDE_URL, TIP_JAR_URL } from "@/lib/source-code";

export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-footer__inner">
        <div className="lp-footer__brand">
          <img
            src="/opendocs-icon.svg"
            alt=""
            width={50}
            height={50}
            style={{ marginBottom: "0.5rem" }}
          />
          <span className="lp-footer__name">
            opendocs<span style={{ fontWeight: 500 }}>.cc</span>
          </span>
          <span className="lp-footer__copy">
            2026 OpenDocs. All rights reserved.
          </span>
          <span className="lp-footer__heart">
            We <em className="lp-footer__heart-icon">&hearts;</em> .md
          </span>
          <div className="lp-footer__socials" aria-label="OpenDocs social links">
            <a
              href="https://github.com/opendocs-cc/"
              className="lp-footer__social"
              aria-label="OpenDocs on GitHub"
            >
              <img src="/github.svg" alt="" width={20} height={20} />
            </a>
            <a
              href="https://x.com/opendocshq"
              className="lp-footer__social"
              aria-label="OpenDocs on X"
            >
              <img src="/x.svg" alt="" width={18} height={18} />
            </a>
          </div>
        </div>

        <div className="lp-footer__columns">
          {/* Product + Free tools share column 1. Visually they're
              two distinct sections with their own headings, but
              they pair logically: both lists of product surfaces. */}
          <div className="lp-footer__column">
            <span className="lp-footer__column-title">Product</span>
            <Link href="/docs" prefetch={false} className="lp-footer__link">
              Docs
            </Link>
            <a href="https://status.opendocs.cc" className="lp-footer__link">
              Status
            </a>
            <a
              href="https://github.com/opendocs-cc/"
              className="lp-footer__link"
            >
              GitHub
            </a>
            <a href={SELF_HOSTING_GUIDE_URL} className="lp-footer__link">
              Self-hosting
            </a>
            <a href={TIP_JAR_URL} className="lp-footer__link">
              Buy me a coffee
            </a>
            <Link href="/login" className="lp-footer__link">
              Sign In
            </Link>

            <span className="lp-footer__column-title lp-footer__column-title--stacked">
              Free tools
            </span>
            <Link href="/tools/markdown-to-pdf" className="lp-footer__link">
              Markdown to PDF
            </Link>
            <Link href="/tools/markdown-to-word" className="lp-footer__link">
              Markdown to Word
            </Link>
            <Link
              href="/tools/publish-markdown-online"
              className="lp-footer__link"
            >
              Paste Markdown, get a link
            </Link>
            <Link href="/tools/chatgpt-to-pdf" className="lp-footer__link">
              ChatGPT to PDF
            </Link>
            <Link href="/tools/readme-to-pdf" className="lp-footer__link">
              README to PDF
            </Link>
            <Link
              href="/tools/markdown-table-to-word"
              className="lp-footer__link"
            >
              Markdown table to Word
            </Link>
            <Link
              href="/tools/share-markdown-document"
              className="lp-footer__link"
            >
              Share Markdown
            </Link>
            <Link
              href="/tools/ai-agent-markdown-to-pdf"
              className="lp-footer__link"
            >
              AI agent → PDF
            </Link>
          </div>

          <div className="lp-footer__column">
            <span className="lp-footer__column-title">Integrations</span>
            <Link href="/mcp" className="lp-footer__link">
              MCP server (Claude, ChatGPT)
            </Link>
            <Link href="/extension" className="lp-footer__link">
              Browser extension
            </Link>
            <Link href="/integrations/openclaw" className="lp-footer__link">
              OpenClaw
            </Link>
            <Link href="/integrations/claude-code" className="lp-footer__link">
              Claude Code
            </Link>
            <Link href="/integrations/cursor" className="lp-footer__link">
              Cursor
            </Link>
            <Link href="/integrations/codex" className="lp-footer__link">
              Codex
            </Link>
            <Link href="/integrations/hermes-agent" className="lp-footer__link">
              Hermes Agent
            </Link>
            <Link href="/integrations/cline" className="lp-footer__link">
              Cline
            </Link>
            <Link href="/integrations/aider" className="lp-footer__link">
              Aider
            </Link>
            <Link href="/integrations/copilot" className="lp-footer__link">
              GitHub Copilot
            </Link>

            <span className="lp-footer__column-title lp-footer__column-title--stacked">
              Use cases
            </span>
            <Link href="/use-cases/ai-agent-docs" className="lp-footer__link">
              AI agent docs
            </Link>
            <Link href="/use-cases/client-reports" className="lp-footer__link">
              Client reports
            </Link>
            <Link href="/use-cases/internal-docs" className="lp-footer__link">
              Internal team docs
            </Link>
          </div>

          <div className="lp-footer__column">
            <span className="lp-footer__column-title">Resources</span>
            <Link
              href="/compare/opendocs-vs-notion"
              className="lp-footer__link"
            >
              vs Notion
            </Link>
            <Link
              href="/compare/opendocs-vs-github-gist"
              className="lp-footer__link"
            >
              vs GitHub Gist
            </Link>
            <Link
              href="/compare/opendocs-vs-gitbook"
              className="lp-footer__link"
            >
              vs GitBook
            </Link>

            <span className="lp-footer__column-title lp-footer__column-title--stacked">
              Legal
            </span>
            <Link href="/privacy" className="lp-footer__link">
              Privacy Policy
            </Link>
            <Link href="/terms" className="lp-footer__link">
              Terms &amp; Conditions
            </Link>
            <Link href="/refund-policy" className="lp-footer__link">
              Refund Policy
            </Link>
            <CookieSettingsButton className="lp-footer__link cursor-pointer bg-transparent p-0 text-left" />
          </div>
        </div>
      </div>
    </footer>
  );
}
