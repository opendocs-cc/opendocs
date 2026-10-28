/**
 * Signature blocks: a ```signature fence listing who signs a document.
 *
 *   ```signature
 *   - role: Employee
 *     name: John Adams
 *     title: Head of Engineering
 *   - role: Board member
 *     name: Jón Jónsson
 *   ```
 *
 * The web view and the exports draw one signature box per entry. When the
 * document is sent for signing, the export carries DocuSeal field tags in
 * each box (doc-converter, `signature_fields`). The same parsing rules live
 * in doc-converter/app/signature_blocks.py; keep them in step.
 */

export type SignatureEntry = { role: string; name?: string; title?: string };

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*signature[ \t]*$/i;
const ROLE_FORBIDDEN = /[;{}=\n]/;
export const MAX_ROLE_LENGTH = 60;

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && /^(["']).*\1$/.test(trimmed)) return trimmed.slice(1, -1).trim();
  return trimmed;
}

export function isValidSignatureRole(role: string): boolean {
  return role.length > 0 && role.length <= MAX_ROLE_LENGTH && !ROLE_FORBIDDEN.test(role);
}

/**
 * Entries of one block's body, or null when the block isn't a valid
 * signature block (no entries, a missing or duplicate role, or a role with
 * forbidden characters) and should render as a plain code block.
 */
export function parseSignatureBlock(body: string): SignatureEntry[] | null {
  const entries: Array<Record<string, string>> = [];
  for (const rawLine of body.split("\n")) {
    if (!rawLine.trim()) continue;
    const item = /^\s*-\s+(.*)$/.exec(rawLine);
    const content = item ? item[1] : rawLine;
    if (item) entries.push({});
    const current = entries[entries.length - 1];
    if (!current) return null;
    const pair = /^\s*([A-Za-z_]+)\s*:\s*(.*)$/.exec(content);
    if (!pair) continue;
    current[pair[1].toLowerCase()] = unquote(pair[2]);
  }
  if (entries.length === 0) return null;

  const seen = new Set<string>();
  const result: SignatureEntry[] = [];
  for (const entry of entries) {
    const role = entry.role ?? "";
    if (!isValidSignatureRole(role) || seen.has(role.toLowerCase())) return null;
    seen.add(role.toLowerCase());
    result.push({
      role,
      ...(entry.name ? { name: entry.name } : {}),
      ...(entry.title ? { title: entry.title } : {}),
    });
  }
  return result;
}

/**
 * The signers of every valid signature block in a document, in order. A
 * role in more than one block is one person signing in several places,
 * so it's listed once (its first entry).
 */
export function findSignatureEntries(markdown: string): SignatureEntry[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const found: SignatureEntry[] = [];
  let open: { marker: string; body: string[] } | null = null;
  let otherFence: string | null = null;

  for (const line of lines) {
    if (open) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === open.marker[0] && close[1].length >= open.marker.length) {
        found.push(...(parseSignatureBlock(open.body.join("\n")) ?? []));
        open = null;
      } else {
        open.body.push(line);
      }
      continue;
    }
    if (otherFence) {
      const close = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[1][0] === otherFence[0] && close[1].length >= otherFence.length) {
        otherFence = null;
      }
      continue;
    }
    const sig = FENCE.exec(line);
    if (sig) {
      open = { marker: sig[1], body: [] };
      continue;
    }
    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (fence) otherFence = fence[1];
  }
  const seen = new Set<string>();
  return found.filter((entry) => {
    const key = entry.role.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** A signature block for these entries, to append to a document. */
export function signatureBlockMarkdown(entries: SignatureEntry[]): string {
  const lines = ["```signature"];
  for (const entry of entries) {
    lines.push(`- role: ${entry.role}`);
    if (entry.name) lines.push(`  name: ${entry.name}`);
    if (entry.title) lines.push(`  title: ${entry.title}`);
  }
  lines.push("```");
  return lines.join("\n");
}
