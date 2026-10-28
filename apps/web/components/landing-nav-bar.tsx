"use client";

import { startTransition, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { FounderOfferBanner } from "@/components/founder-offer-banner";
import { authClient } from "@/lib/auth-client";
import { Coffee } from "lucide-react";

import { SELF_HOST_SECTION_PATH, TIP_JAR_URL } from "@/lib/source-code";
import {
  useFounderOfferOpen,
  type FounderOfferView,
} from "@/lib/billing/founder-offer-display";

export type LandingNavProps = {
  active?: "pricing" | "faq";
  /**
   * Whether the viewer is already signed in. Pass from a Server
   * Component that has read the session cookie — bots don't carry
   * cookies, so they receive `false` and see the SEO-safe signed-out
   * HTML. Logged-in users get "Sign out" + "Go to Dashboard" instead
   * of "Sign in" + "Get started".
   */
  authenticated?: boolean;
};

type LandingNavBarProps = LandingNavProps & {
  /** The open founding-member offer, read per request by LandingNav. */
  founderOffer: FounderOfferView | null;
};

const integrations = [
  { name: "MCP server (Claude, ChatGPT)", href: "/mcp" },
  { name: "Claude Code", href: "/integrations/claude-code" },
  { name: "Cursor", href: "/integrations/cursor" },
  { name: "GitHub Copilot", href: "/integrations/copilot" },
  { name: "Cline", href: "/integrations/cline" },
  { name: "Aider", href: "/integrations/aider" },
  { name: "Hermes Agent", href: "/integrations/hermes-agent" },
  { name: "Codex", href: "/integrations/codex" },
  { name: "OpenClaw", href: "/integrations/openclaw" },
];

export function LandingNavBar({
  active,
  authenticated = false,
  founderOffer,
}: LandingNavBarProps) {
  const router = useRouter();
  const showOffer = useFounderOfferOpen(founderOffer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [integrationsOpen, setIntegrationsOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    if (signingOut) return;
    setSigningOut(true);
    startTransition(async () => {
      await authClient.signOut();
      router.push("/");
      router.refresh();
      setSigningOut(false);
    });
  };

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  // Close menu on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, []);

  return (
    <>
    <header className="lp-header">
      {showOffer && founderOffer && (
        <FounderOfferBanner offer={founderOffer} linkToPricing={active !== "pricing"} />
      )}
      <nav className="lp-nav">
        <div className="lp-nav__left">
          <Link href="/" className="lp-logo">
            <img src="/opendocs-logo.svg" alt="OpenDocs" height={22} />
          </Link>
          <div className="lp-nav__links">
            <a href="https://docs.opendocs.cc" className="lp-nav__link">
              Docs
            </a>
            <Link
              href="/pricing"
              className={
                active === "pricing" ? "lp-nav__link--active" : "lp-nav__link"
              }
            >
              Pricing
            </Link>
            <Link
              href="/faq"
              className={
                active === "faq" ? "lp-nav__link--active" : "lp-nav__link"
              }
            >
              FAQ
            </Link>
            <Link href={SELF_HOST_SECTION_PATH} className="lp-nav__link">
              Open source
            </Link>
            <a
              href="https://github.com/opendocs-cc/"
              className="lp-nav__social"
              aria-label="OpenDocs on GitHub"
            >
              <img src="/github.svg" alt="" width={20} height={20} />
            </a>
            <a
              href="https://x.com/opendocshq"
              className="lp-nav__social"
              aria-label="X (Twitter)"
            >
              <img src="/x.svg" alt="" width={18} height={18} />
            </a>
          </div>
        </div>
        <div className="lp-nav__right">
          <a
            href={TIP_JAR_URL}
            className="lp-nav__coffee"
            aria-label="Buy me a coffee"
            title="Buy me a coffee"
          >
            <Coffee aria-hidden="true" />
            <span className="lp-nav__coffee-label">Buy me a coffee</span>
          </a>
          {authenticated ? (
            <>
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="lp-btn-text lp-nav__signin"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
              <Link
                href="/dashboard"
                className="lp-btn-gradient lp-btn-gradient--sm lp-nav__cta"
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="lp-btn-text lp-nav__signin">
                Sign in
              </Link>
              <Link
                href="/signup"
                className="lp-btn-gradient lp-btn-gradient--sm lp-nav__cta"
              >
                Get started
              </Link>
            </>
          )}
          <button
            className="lp-hamburger"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <span className="lp-hamburger__line" />
            <span className="lp-hamburger__line" />
            <span className="lp-hamburger__line" />
          </button>
        </div>
      </nav>
    </header>
      {/* The header is fixed, so the banner inside it needs room in the flow. */}
      {showOffer && founderOffer && <div className="lp-offer-spacer" aria-hidden />}

      {/* Full-screen mobile menu — outside header to avoid backdrop-filter containing block */}
      <div
        className={`lp-mobile-menu ${menuOpen ? "lp-mobile-menu--open" : ""}`}
        aria-hidden={!menuOpen}
      >
        <div className="lp-mobile-menu__header">
          <Link
            href="/"
            className="lp-logo"
            onClick={() => setMenuOpen(false)}
          >
            <img src="/opendocs-logo.svg" alt="OpenDocs" height={22} />
          </Link>
          <button
            className="lp-mobile-menu__close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="lp-mobile-menu__body">
          <a
            href="https://docs.opendocs.cc"
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            Docs
          </a>
          <Link
            href="/pricing"
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            Pricing
          </Link>
          <Link
            href="/faq"
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            FAQ
          </Link>
          <Link
            href={SELF_HOST_SECTION_PATH}
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            Open source
          </Link>

          {/* Integrations accordion */}
          <button
            className="lp-mobile-menu__link lp-mobile-menu__accordion"
            onClick={() => setIntegrationsOpen(!integrationsOpen)}
          >
            Integrations
            <svg
              className={`lp-mobile-menu__chevron ${integrationsOpen ? "lp-mobile-menu__chevron--open" : ""}`}
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div
            className={`lp-mobile-menu__sub ${integrationsOpen ? "lp-mobile-menu__sub--open" : ""}`}
          >
            <div className="lp-mobile-menu__sub-inner">
              {integrations.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="lp-mobile-menu__sub-link"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>

          <a
            href="https://github.com/opendocs-cc/"
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            <span>GitHub</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginLeft: 8 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>

          <a
            href="https://x.com/opendocshq"
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            <span>X</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginLeft: 8 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <a
            href={TIP_JAR_URL}
            className="lp-mobile-menu__link"
            onClick={() => setMenuOpen(false)}
          >
            <span>Buy me a coffee</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, marginLeft: 8 }}>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>

        <div className="lp-mobile-menu__footer">
          {authenticated ? (
            <>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  handleSignOut();
                }}
                disabled={signingOut}
                className="lp-mobile-menu__btn lp-mobile-menu__btn--ghost"
              >
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
              <Link
                href="/dashboard"
                className="lp-mobile-menu__btn lp-mobile-menu__btn--primary"
                onClick={() => setMenuOpen(false)}
              >
                Go to Dashboard
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="lp-mobile-menu__btn lp-mobile-menu__btn--ghost"
                onClick={() => setMenuOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="lp-mobile-menu__btn lp-mobile-menu__btn--primary"
                onClick={() => setMenuOpen(false)}
              >
                Get started
              </Link>
            </>
          )}
        </div>
      </div>
    </>
  );
}
