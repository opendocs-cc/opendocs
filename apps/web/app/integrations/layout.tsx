import { LandingFooter } from "@/components/landing-footer";
import { LandingNav } from "@/components/landing-nav";
import { getServerSession } from "@/lib/auth/session";

import "../landing.css";

export default async function IntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  return (
    <div className="lp">
      <LandingNav authenticated={Boolean(session)} />

      {children}

      <LandingFooter />
    </div>
  );
}
