// Copies the canonical SKILL.md (bundled with the npm CLI in the sibling
// opendocs-cli repo) to every place this repo serves or ships it:
//   SKILL.md                                                (repo root)
//   apps/web/public/skill.md                               (opendocs.cc/skill.md)
//   apps/web/public/.well-known/agent-skills/opendocs/SKILL.md (npx skills / install.sh)
// Usage: npm run sync:skill [-- path/to/SKILL.md]
import { copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] ?? resolve(root, "../opendocs-cli/agent/SKILL.md"));
if (!existsSync(source)) {
  console.error(`SKILL.md not found at ${source}. Pass the path explicitly.`);
  process.exit(1);
}
for (const target of [
  "SKILL.md",
  "apps/web/public/skill.md",
  "apps/web/public/.well-known/agent-skills/opendocs/SKILL.md",
]) {
  copyFileSync(source, resolve(root, target));
  console.log(`synced ${target}`);
}
