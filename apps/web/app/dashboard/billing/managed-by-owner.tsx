import { PageHeader } from "@/components/dashboard/page-header";

const PLAN_NAMES = { free: "Free", pro: "Pro", team: "Team" } as const;

/** What admins see on Billing: the workspace's plan, and who can change it. */
export function BillingManagedByOwner({
  workspaceName,
  tier,
  ownerName,
  ownerEmail,
}: {
  workspaceName: string;
  tier: "free" | "pro" | "team";
  ownerName: string;
  ownerEmail: string | null;
}) {
  return (
    <div className="w-full min-h-full">
      <div className="max-w-[1000px] mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 flex flex-col gap-6">
        <PageHeader title="Billing" description={`The plan ${workspaceName} is on.`} />
        <div className="rounded-xl border border-[#e5e5e5] bg-white p-5 shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] sm:p-6">
          <p className="text-[14px] text-[#737373]">Plan</p>
          <p className="mt-1 text-[28px] font-semibold leading-[36px] text-[#171717]">{PLAN_NAMES[tier]}</p>
          <p className="mt-3 max-w-[560px] text-[14px] leading-[20px] text-[#525252]">
            Billing for {workspaceName} is managed by its owner, {ownerName}
            {ownerEmail && ownerName !== ownerEmail ? ` (${ownerEmail})` : ""}. Ask them to change the plan, seats or
            payment method.
          </p>
        </div>
      </div>
    </div>
  );
}
