import type { ReactNode } from "react";

type FormRowProps = {
  title: string;
  description?: string;
  children: ReactNode;
  /**
   * Optional badge rendered next to the title. Used to mark Pro-only
   * settings so Free users get a visual cue before they interact.
   */
  titleBadge?: ReactNode;
  /**
   * Vertical alignment of the title column relative to the children.
   * Defaults to "start" (top-aligned) for forms where the right column
   * can grow tall (textareas, multi-field groups). Use "center" for
   * rows with short, fixed-height controls (color swatches, toggles)
   * so the label sits next to them instead of floating above.
   */
  align?: "start" | "center";
};

export function FormRow({
  title,
  description,
  children,
  titleBadge,
  align = "start",
}: FormRowProps) {
  const mdAlign = align === "center" ? "md:items-center" : "md:items-start";
  return (
    <div
      className={`flex flex-col md:flex-row gap-4 md:gap-8 py-5 border-b border-[#e5e5e5] last:border-b-0 ${mdAlign}`}
    >
      <div className="md:w-[280px] flex-shrink-0">
        <div className="flex items-center gap-2">
          <p className="text-[14px] font-medium text-[#404040]">{title}</p>
          {titleBadge}
        </div>
        {description && (
          <p className="text-[14px] text-[#737373] mt-1">{description}</p>
        )}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
