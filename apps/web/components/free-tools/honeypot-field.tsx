import type { RefObject } from "react";

import { FREE_TOOL_LIMITS } from "@opendocs/shared/config/free-tools";

/**
 * The bot trap for the free tools: off-screen, skipped by the keyboard and
 * hidden from screen readers, so only a bot filling every input finds it.
 * Not `display: none`, which some bots skip. Styled inline so it works on
 * pages without landing.css (the anonymous reader page).
 */
export function HoneypotField({ inputRef }: { inputRef: RefObject<HTMLInputElement | null> }) {
  return (
    <div
      aria-hidden="true"
      style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
    >
      <label>
        Website
        <input
          ref={inputRef}
          type="text"
          name={FREE_TOOL_LIMITS.botCheck.honeypotField}
          tabIndex={-1}
          autoComplete="off"
          defaultValue=""
        />
      </label>
    </div>
  );
}
