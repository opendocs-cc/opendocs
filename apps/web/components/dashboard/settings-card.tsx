import type { ReactNode } from "react";

/**
 * A titled group of settings rows (FormRow) in a card, with an optional
 * footer for groups that are saved together.
 */
export function SettingsCard({
  id,
  title,
  description,
  action,
  footer,
  children,
}: {
  /** Anchor for links straight to this card (scrolls clear of the top). */
  id?: string;
  title: string;
  description?: string;
  /** A button for the whole group, shown beside the title. */
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 rounded-xl border border-[#e5e5e5] bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col gap-3 border-b border-[#f0f0f0] px-4 pt-5 pb-4 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold leading-[24px] text-[#171717]">{title}</h2>
          {description && <p className="mt-0.5 text-[14px] leading-[20px] text-[#737373]">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="px-4 sm:px-6">{children}</div>
      {footer}
    </section>
  );
}
