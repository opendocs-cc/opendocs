import Link from "next/link";

import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { WorkspaceNotFound } from "@/components/workspace-not-found";
import { getReaderSession, getServerSession } from "@/lib/auth/session";
import { getSiteContext } from "@/lib/site-context";
import { isCustomSite } from "@/lib/site-paths";

import "./landing.css";

export default async function NotFoundPage() {
  // Unknown paths on a custom domain get the workspace's own 404.
  const site = await getSiteContext();
  if (isCustomSite(site)) {
    return <WorkspaceNotFound site={site} isViewerSignedIn={Boolean(await getReaderSession())} />;
  }
  const session = await getServerSession();

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />

      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "8rem 2rem 4rem",
        }}
      >
        <svg
          width="420"
          height="280"
          viewBox="0 0 420 280"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{ marginBottom: "2rem", maxWidth: "100%" }}
        >
          {/* Terminal window */}
          <rect x="0" y="0" width="420" height="280" rx="12" fill="#1e1e1e" stroke="#333" strokeWidth="1" />

          {/* Title bar */}
          <rect x="0" y="0" width="420" height="36" rx="12" fill="#2d2d2d" />
          <rect x="0" y="24" width="420" height="12" fill="#2d2d2d" />
          <circle cx="20" cy="18" r="6" fill="#ef4444" />
          <circle cx="40" cy="18" r="6" fill="#eab308" />
          <circle cx="60" cy="18" r="6" fill="#22c55e" />

          {/* Prompt line */}
          <text x="24" y="68" fontFamily="'JetBrains Mono', monospace" fontSize="13" fill="#22c55e">➜</text>
          <text x="44" y="68" fontFamily="'JetBrains Mono', monospace" fontSize="13" fill="#a1a1aa">opendocs get this-page</text>

          {/* Error output */}
          <text x="24" y="100" fontFamily="'JetBrains Mono', monospace" fontSize="13" fill="#ef4444">
            ✘ Error: Document not found
          </text>
          <text x="24" y="124" fontFamily="'JetBrains Mono', monospace" fontSize="12" fill="#71717a">
            The requested path does not match any
          </text>
          <text x="24" y="142" fontFamily="'JetBrains Mono', monospace" fontSize="12" fill="#71717a">
            published document or route.
          </text>

          {/* Suggestion */}
          <text x="24" y="176" fontFamily="'JetBrains Mono', monospace" fontSize="12" fill="#52525b">
            Try:
          </text>
          <text x="24" y="200" fontFamily="'JetBrains Mono', monospace" fontSize="12" fill="#a1a1aa">
            opendocs list
            <tspan fill="#52525b">  # see your documents</tspan>
          </text>
          <text x="24" y="222" fontFamily="'JetBrains Mono', monospace" fontSize="12" fill="#a1a1aa">
            opendocs publish doc.md
            <tspan fill="#52525b">  # publish a new one</tspan>
          </text>

          {/* Empty prompt with blinking cursor */}
          <text x="24" y="258" fontFamily="'JetBrains Mono', monospace" fontSize="13" fill="#22c55e">➜</text>
          <rect x="44" y="247" width="8" height="15" fill="#f4f4f5">
            <animate attributeName="opacity" values="1;0;1" dur="1.2s" repeatCount="indefinite" />
          </rect>
        </svg>

        <p
          style={{
            fontSize: "1rem",
            color: "#71717a",
            margin: "0 0 1.5rem",
            textAlign: "center",
          }}
        >
          Nothing here. Maybe it was never published.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0.75rem 1.5rem",
            borderRadius: "0.5rem",
            background: "#6B3FC9",
            color: "#fff",
            fontWeight: 600,
            fontSize: "0.9375rem",
            textDecoration: "none",
          }}
        >
          Back to OpenDocs
        </Link>
      </main>

      <LandingFooter />
    </div>
  );
}
