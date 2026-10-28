/**
 * Code-block snippet used across the marketing pages to show the
 * "install + publish" CLI workflow. Two reasons it's its own
 * component rather than inline JSX:
 *
 *   1. The wording (`opendocs publish ...`) shows up on >10 pages
 *      and we'd otherwise drift across copies.
 *   2. The `--export` flag and `--json` flag are the two affordances
 *      that matter most for power users / agents — putting them in
 *      one component means we'll add new flags in one place when
 *      they ship.
 *
 * `format` switches the comment between PDF and DOCX so the block
 * stays accurate on `/tools/markdown-to-pdf` vs the Word page.
 * `agentMode` enables the `--json` line that's only relevant when
 * a script / agent is parsing the output.
 *
 * `anonymous` shows the no-account flow instead (`--anonymous`: a link that
 * works for 24 hours), for the publish tool.
 */
type MarketingCliBlockProps = {
  format?: "pdf" | "docx" | "url";
  agentMode?: boolean;
  anonymous?: boolean;
};

export function MarketingCliBlock({
  format = "url",
  agentMode = false,
  anonymous = false,
}: MarketingCliBlockProps) {
  if (anonymous) {
    return (
      <pre className="mk-code">
        <code>
          <span className="mk-code__comment"># Install once</span>
          {"\n"}
          npm install -g @opendocs.cc/cli
          {"\n\n"}
          <span className="mk-code__comment">
            # No account: a link anyone can open for 24 hours
          </span>
          {"\n"}
          {`opendocs publish notes.md --anonymous${agentMode ? " --json" : ""}`}
          {"\n\n"}
          <span className="mk-code__comment">
            # Keep it: sign up, and it moves into your workspace
          </span>
          {"\n"}
          opendocs login --email you@example.com
        </code>
      </pre>
    );
  }

  const exportFlag =
    format === "pdf"
      ? " --export pdf"
      : format === "docx"
        ? " --export docx"
        : "";
  const fileExt = format === "url" ? "md" : "md";
  const cmd = `opendocs publish report.${fileExt}${exportFlag}${
    agentMode ? " --json" : ""
  }`;

  return (
    <pre className="mk-code">
      <code>
        <span className="mk-code__comment"># Install once</span>
        {"\n"}
        npm install -g @opendocs.cc/cli
        {"\n\n"}
        <span className="mk-code__comment">
          # Authenticate (one-time, opens browser)
        </span>
        {"\n"}
        opendocs login --browser
        {"\n\n"}
        <span className="mk-code__comment">
          # Publish, get a shareable URL back
        </span>
        {"\n"}
        {cmd}
      </code>
    </pre>
  );
}
