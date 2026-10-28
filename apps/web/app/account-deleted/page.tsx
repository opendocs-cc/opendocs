import Link from "next/link";

import { capitalized, endSentence, legalEntity } from "@/lib/legal-entity";
import { buildPageMetadata } from "@/lib/metadata";

export const metadata = buildPageMetadata({
  title: "Account deleted",
  description:
    "Your OpenDocs account and all associated data have been permanently deleted.",
  url: "https://opendocs.cc/account-deleted",
  // Post-flow confirmation — nobody should ever land here from a
  // Google search, so keep it out of the index.
  noIndex: true,
});

// The operator's details come from the environment at request time.
export const dynamic = "force-dynamic";

export default function AccountDeletedPage() {
  const entity = legalEntity();
  return (
    <div className="legal-page">
      <nav className="legal-page__nav">
        <Link href="/" className="legal-page__logo">
          <img src="/opendocs-logo.svg" alt="OpenDocs" height={20} />
        </Link>
      </nav>

      <article className="legal-page__content">
        <h1>Account deleted</h1>
        <p>
          Your OpenDocs account and all associated data have been permanently
          deleted. We&apos;re sorry to see you go &mdash; thank you for using
          OpenDocs.
        </p>
        <p>
          If this was a mistake, or if you&apos;d like to share feedback, please
          reach out to{" "}
          <a href="mailto:hello@opendocs.cc">hello@opendocs.cc</a>.
        </p>
        <p>
          <Link href="/">Back to home</Link>
        </p>
      </article>

      <footer className="legal-page__footer">
        <span>&copy; 2026 {endSentence(capitalized(entity.name))} All rights reserved.</span>
        <div className="legal-page__footer-links">
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/">Home</Link>
        </div>
      </footer>
    </div>
  );
}
