import type { Metadata } from "next";

import { buildPageMetadata } from "@/lib/metadata";
import { ForgotPasswordForm } from "./form";

export const metadata: Metadata = buildPageMetadata({
  title: "Forgot password",
  description: "Request a password reset link for your OpenDocs account.",
  url: "https://opendocs.cc/forgot-password",
  // Transactional flow — no SEO value and we don't want it ranking
  // on brand queries in place of /login.
  noIndex: true,
});

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
