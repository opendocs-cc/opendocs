// A fence line: optional indentation or blockquote markers, then three or more
// backticks or tildes, then the info string ([^\n] rather than ., so a
// trailing \r from CRLF files still matches).
const FENCE_LINE = /^[\s>]*(`{3,}|~{3,})([^\n]*)$/;

type OpenFence = { char: string; length: number; isPrivate: boolean };

function openingFence(line: string): OpenFence | null {
  const match = FENCE_LINE.exec(line);
  if (!match) return null;
  const [, fence, rest] = match;
  const info = rest.trim();
  // Backtick fences can't have a backtick in their info string (CommonMark),
  // so ``` inside inline code isn't a fence.
  if (fence[0] === "`" && info.includes("`")) return null;
  return {
    char: fence[0],
    length: fence.length,
    isPrivate: info.split(/\s+/)[0]?.toLowerCase() === "private",
  };
}

function closesFence(line: string, open: OpenFence) {
  const match = FENCE_LINE.exec(line);
  return Boolean(
    match && match[1][0] === open.char && match[1].length >= open.length && match[2].trim() === "",
  );
}

/**
 * Drops fenced ```private blocks: fences of three or more backticks or tildes
 * whose info string starts with `private`, closed by the same character at least
 * as long, as CommonMark reads them. A private fence that's never closed hides
 * the rest of the document, like an unclosed code block. Fences inside another
 * code block are content, so a documentation example of the syntax survives.
 */
function scan(markdown: string, onPrivate?: () => void) {
  const kept: string[] = [];
  let open: OpenFence | null = null;
  for (const line of markdown.split("\n")) {
    if (open) {
      if (!open.isPrivate) kept.push(line);
      if (closesFence(line, open)) open = null;
      continue;
    }
    open = openingFence(line);
    if (open?.isPrivate) onPrivate?.();
    if (!open?.isPrivate) kept.push(line);
  }
  return kept.join("\n");
}

export function stripPrivateBlocks(markdown: string) {
  return scan(markdown).trim();
}

export function hasPrivateBlocks(markdown: string) {
  let found = false;
  scan(markdown, () => {
    found = true;
  });
  return found;
}
