import { CopyButton } from "@/app/components/copy-button";

// globals.css gives buttons `font: inherit` outside any layer, so a copy
// button takes its font from the row around it, not from its own classes.

const COPY_ON_DARK =
  "flex-none rounded-lg bg-white/10 px-3 py-1.5 font-sans text-xs font-medium text-white transition hover:bg-white/20 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40";

/** A one-line terminal command with a copy button. */
export function CommandRow({ command }: { command: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-[#17151c] py-2 pl-4 pr-2 font-mono text-[12.5px] text-zinc-200">
      <span className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {command}
      </span>
      <CopyButton text={command} srLabel={command} className={COPY_ON_DARK} />
    </div>
  );
}

/** A multi-line snippet (JSON, TOML) with a file label and a copy button. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-xl bg-[#17151c]">
      <div className="flex items-center justify-between gap-3 py-2 pl-4 pr-2 font-mono text-[12.5px]">
        <span className="min-w-0 truncate text-[12px] text-zinc-400">{label}</span>
        <CopyButton text={code} srLabel={label} className={COPY_ON_DARK} />
      </div>
      <pre className="overflow-x-auto px-4 pb-4 font-mono text-[12.5px] leading-relaxed text-zinc-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}
