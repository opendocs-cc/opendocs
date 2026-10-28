// Runs after `docusaurus build` (npm "postbuild"). Writes LLM-friendly
// copies of the docs into build/ so nginx serves them next to the HTML:
//   /llms.txt         index of every page, in sidebar order
//   /llms-full.txt    every page's Markdown in one file
//   /<page>.md        the Markdown source of each page (e.g. /cli/reference.md)
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const outDir = path.join(root, "build");
const SITE = "https://docs.opendocs.cc";

if (!fs.existsSync(outDir)) {
  console.error("build/ not found; run `docusaurus build` first.");
  process.exit(1);
}

function parse(file) {
  const raw = fs.readFileSync(file, "utf8");
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const meta = {};
  if (match) {
    for (const line of match[1].split("\n")) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
    }
  }
  const body = (match ? raw.slice(match[0].length) : raw)
    .split("\n")
    .filter((line) => !/^import\s.+from\s.+;?$/.test(line))
    .join("\n")
    .trim();
  return { meta, body };
}

const require = createRequire(import.meta.url);
const sidebars = require(path.join(root, "sidebars.js"));
const sidebar = (sidebars.default ?? sidebars).docsSidebar;

function docsIn(items) {
  return items.flatMap((item) =>
    typeof item === "string" ? [item] : item.type === "doc" ? [item.id] : docsIn(item.items ?? []),
  );
}

const sections = [];
const seen = new Set();
for (const entry of sidebar) {
  const ids = typeof entry === "string" ? [entry] : docsIn(entry.items ?? []);
  sections.push({ label: typeof entry === "string" ? "Docs" : entry.label, ids });
  ids.forEach((id) => seen.add(id));
}

const pages = new Map();
for (const section of sections) {
  for (const id of section.ids) {
    const file = [".md", ".mdx"].map((ext) => path.join(docsDir, id + ext)).find((f) => fs.existsSync(f));
    if (!file) continue;
    const { meta, body } = parse(file);
    if (body.includes("<Redirect")) continue;
    const route = meta.slug && meta.slug.startsWith("/") ? meta.slug : `/${id}`;
    pages.set(id, { route, title: meta.title || id, description: meta.description || "", body });
  }
}

let index = `# OpenDocs documentation

> OpenDocs publishes Markdown to shareable links (private to a workspace by default) and exports PDF or DOCX. Built for AI agents.

Start here as an agent:
- Install the skill: \`npx skills add opendocs-cc/skills --skill opendocs -g -y\`, or without Node.js \`curl -fsSL https://opendocs.cc/install.sh | bash\` (if npx ends with "PromptScript does not support global skill installation", that's a known installer bug; the skill is still installed)
- Then sign the user up (free, 50 documents): \`opendocs login --email <email>\` emails a 6-digit code, \`--code <code>\` finishes. Prefer this to 24-hour \`--anonymous\` links.
- Agent quickstart (Markdown): https://docs.opendocs.cc/getting-started/agent-quickstart.md
- Compact agent guide: \`curl https://opendocs.cc/docs\`
- Skill: https://opendocs.cc/skill.md
- OpenAPI: https://opendocs.cc/openapi.json
- Everything below in one file: ${SITE}/llms-full.txt

Every page is also available as Markdown by adding \`.md\` to its URL.
`;
let full = `# OpenDocs documentation (full text)\n\nSource: ${SITE}\n`;

for (const section of sections) {
  const sectionPages = section.ids.map((id) => pages.get(id)).filter(Boolean);
  if (sectionPages.length === 0) continue;
  index += `\n## ${section.label}\n\n`;
  for (const page of sectionPages) {
    // The home page lives at "/", so its Markdown copy is /index.md.
    const mdRoute = page.route === "/" ? "/index" : page.route;
    index += `- [${page.title}](${SITE}${mdRoute}.md)${page.description ? `: ${page.description}` : ""}\n`;
    full += `\n\n---\n\nURL: ${SITE}${page.route}\n\n${page.body}\n`;
    const target = path.join(outDir, `${mdRoute}.md`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${page.body}\n`);
  }
}

fs.writeFileSync(path.join(outDir, "llms.txt"), index);
fs.writeFileSync(path.join(outDir, "llms-full.txt"), full);
console.log(`llms.txt: ${pages.size} pages; llms-full.txt: ${(full.length / 1024).toFixed(0)} KB`);
