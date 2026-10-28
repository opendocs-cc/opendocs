import { findAgentLogo } from "@/lib/agent-logos";
import { CLAUDE_ADMIN_CONNECTOR_URL, CLAUDE_CONNECTOR_URL } from "@/lib/mcp";

const claudeMark = findAgentLogo("claude");

/**
 * Opens claude.ai's "Add custom connector" dialog with OpenDocs filled in.
 * `admin` is the Team and Enterprise variant an owner uses to add it for
 * the whole organization.
 */
export function AddToClaudeButton({
  className,
  iconClassName = "h-[18px] w-[18px]",
  label = "Add to Claude",
  admin = false,
}: {
  className: string;
  iconClassName?: string;
  label?: string;
  admin?: boolean;
}) {
  return (
    <a
      href={admin ? CLAUDE_ADMIN_CONNECTOR_URL : CLAUDE_CONNECTOR_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {claudeMark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={`flex-none fill-current ${iconClassName}`}>
          <path d={claudeMark.path} />
        </svg>
      ) : null}
      <span>{label}</span>
    </a>
  );
}
