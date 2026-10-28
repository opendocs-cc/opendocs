import Link from "next/link";

export function MarketingHeader() {
  return (
    <header className="od-shell" style={{ padding: "1.2rem 0 0" }}>
      <div
        className="od-panel"
        style={{
          borderRadius: "999px",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <Link href="/" style={{ display: "flex", alignItems: "center" }}>
          <img src="/opendocs-logo.svg" alt="OpenDocs" height={20} />
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: "0.9rem" }}>
          <Link className="od-muted" href="/login">
            Sign in
          </Link>
          <Link
            href="/signup"
            style={{
              borderRadius: "999px",
              padding: "0.7rem 1rem",
              background: "var(--od-accent)",
              color: "#fff",
              fontWeight: 600,
            }}
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
