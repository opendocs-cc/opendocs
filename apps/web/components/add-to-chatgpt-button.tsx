import { ArrowUpRight } from "lucide-react";

import { CHATGPT_PLUGIN_URL } from "@/lib/mcp";

/**
 * Opens OpenDocs.cc in ChatGPT's plugin directory, where Install plugin
 * connects it. There's no ChatGPT mark: OpenAI's isn't in Simple Icons.
 */
export function AddToChatGptButton({
  className,
  iconClassName = "h-4 w-4",
  label = "Add to ChatGPT",
}: {
  className: string;
  iconClassName?: string;
  label?: string;
}) {
  return (
    <a href={CHATGPT_PLUGIN_URL} target="_blank" rel="noopener noreferrer" className={className}>
      <span>{label}</span>
      <ArrowUpRight aria-hidden="true" className={`flex-none ${iconClassName}`} />
    </a>
  );
}
