import type { ReactNode } from "react";

/**
 * The top of every dashboard page: a title, one line on what the page is
 * for, and the page's main actions on the right (stacked below on phones).
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[24px] font-semibold leading-[32px] tracking-[-0.015em] text-[#171717]">{title}</h1>
        {description && (
          <p className="mt-1 max-w-[640px] text-[15px] leading-[22px] text-[#525252]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
