import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/components/sign-out-button";

type DashboardShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  userLabel?: string | null;
};

const navItems = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/onboarding", label: "Onboarding" },
  { href: "/login", label: "Auth" },
] as const;

export function DashboardShell({
  title,
  description,
  children,
  userLabel,
}: DashboardShellProps) {
  return (
    <main className="od-shell" style={{ padding: "2rem 0 4rem" }}>
      <div
        style={{
          display: "grid",
          gap: "1rem",
          gridTemplateColumns: "16rem minmax(0, 1fr)",
        }}
      >
        <aside className="od-panel" style={{ borderRadius: "var(--od-radius-lg)", padding: "1rem" }}>
          <Link href="/dashboard" style={{ display: "inline-flex", marginBottom: "0.25rem" }}>
            <img src="/opendocs-logo.svg" alt="OpenDocs" height={22} />
          </Link>
          <nav style={{ display: "grid", gap: "0.55rem" }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "0.7rem 0.8rem",
                  borderRadius: "12px",
                  color: "var(--od-text-muted)",
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>

        <section className="od-panel" style={{ borderRadius: "var(--od-radius-lg)", padding: "1.4rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              marginBottom: "1rem",
            }}
          >
            <p className="od-pill" style={{ margin: 0 }}>
              {userLabel ?? "OpenDocs workspace"}
            </p>
            <SignOutButton />
          </div>
          <h1 style={{ marginBottom: "0.5rem" }}>{title}</h1>
          <p className="od-muted" style={{ marginTop: 0 }}>
            {description}
          </p>
          <div style={{ marginTop: "1.6rem" }}>{children}</div>
        </section>
      </div>
    </main>
  );
}
