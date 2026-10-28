import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireServerSession } from "@/lib/auth/session";
import { getWorkspaceEmailDomains, isServiceError } from "@opendocs/shared/integrations/service";
import { getSignatureRequest } from "@opendocs/shared/integrations/signatures";

import { UpgradePrompt } from "../../integrations-client";
import { SignatureRequestClient } from "./signature-client";

export const metadata: Metadata = { title: "Signature request" };

export default async function SignatureRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireServerSession();
  const { id } = await params;
  const request = await getSignatureRequest(session.user.id, id);
  if (isServiceError(request)) {
    if (request.error === "plan_required") return <UpgradePrompt />;
    if (request.error === "forbidden") {
      return (
        <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10">
          <h1 className="text-[20px] font-semibold text-[#171717]">Signature request</h1>
          <p className="text-[15px] text-[#525252] mt-1">Only owners and admins can use integrations in this workspace.</p>
        </div>
      );
    }
    notFound();
  }

  const domains = await getWorkspaceEmailDomains(request.workspaceId);
  const outside = request.signers
    .filter((s) => domains.size > 0 && !domains.has(s.email.split("@")[1] ?? ""))
    .map((s) => s.email);

  return <SignatureRequestClient request={request} outsideEmails={outside} />;
}
