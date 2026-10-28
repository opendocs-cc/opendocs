"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";

import { cn } from "./utils";

/**
 * Square selection checkbox styled to match the documents-table form
 * fields — same `#d4d4d4` border, same `#f4ebff` focus halo, the
 * primary `#7F56D9` fills the box when checked. Mirrors the visual
 * weight of the table's other affordances (Eye / Edit / Trash icon
 * buttons) so a row of checkboxes doesn't visually shout.
 *
 * Indicator swaps between a check (single-row selection) and a minus
 * (header "indeterminate" state when some-but-not-all rows below are
 * selected) so the header checkbox can communicate partial selection
 * without needing extra copy.
 */
function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer inline-flex size-[18px] shrink-0 items-center justify-center rounded-[4px] border border-[#d4d4d4] bg-white shadow-[0px_1px_2px_0px_rgba(0,0,0,0.05)] outline-none transition-colors hover:border-[#7F56D9] focus-visible:ring-4 focus-visible:ring-[#f4ebff] focus-visible:border-[#7F56D9] data-[state=checked]:bg-[#7F56D9] data-[state=checked]:border-[#7F56D9] data-[state=indeterminate]:bg-[#7F56D9] data-[state=indeterminate]:border-[#7F56D9] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="flex items-center justify-center text-white"
      >
        {props.checked === "indeterminate" ? (
          <Minus className="size-3" strokeWidth={3} />
        ) : (
          <Check className="size-3" strokeWidth={3} />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
