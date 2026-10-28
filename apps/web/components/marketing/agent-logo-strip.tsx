import { AGENT_LOGOS } from "@/lib/agent-logos";

/** "Works with every agent" row, as on the home page. */
export function AgentLogoStrip({
  label = "Works with Claude Code, Codex, Cursor and any agent that can run a command.",
}: {
  label?: string;
}) {
  return (
    <section className="mx-auto w-full max-w-[760px] px-5 py-6 sm:px-6">
      <div className="flex flex-col gap-5 border-y border-zinc-200/80 py-6">
        <p className="text-[15px] leading-snug text-zinc-600">{label}</p>
        <ul className="flex flex-wrap items-center gap-x-7 gap-y-4 text-zinc-400">
          {AGENT_LOGOS.map((logo) => (
            <li key={logo.slug}>
              <svg role="img" viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                <title>{logo.title}</title>
                <path d={logo.path} />
              </svg>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
