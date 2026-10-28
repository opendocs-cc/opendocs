<!-- SPDX-License-Identifier: MIT -->

# Licensing

This repository's default license is **FSL-1.1-MIT**, in [`LICENSE`](LICENSE).
The folders and files below override it. Each `LICENSE` file is the legal
text for the code it sits with; this page is a map.

| Path | License | What it is |
| --- | --- | --- |
| *(everything not listed below)* | FSL-1.1-MIT | |
| `apps/web/` | FSL-1.1-MIT | Website, dashboard and document pages (Next.js) |
| `apps/api/` | FSL-1.1-MIT | REST API (Express) |
| `apps/mcp/` | FSL-1.1-MIT | MCP server |
| `packages/shared/` | FSL-1.1-MIT | Code shared by web and api |
| `packages/ads/` | FSL-1.1-MIT | Placeholder for the optional ads add-on |
| `apps/docs/` | **MIT** | The documentation at docs.opendocs.cc (Docusaurus) |
| `SKILL.md`, `apps/web/public/skill.md`, `apps/web/public/.well-known/agent-skills/opendocs/` | **MIT** | The agent skill and its `scripts/opendocs.sh`, meant to be copied into AI tools. Each file carries an `SPDX-License-Identifier: MIT` line |
| `apps/web/public/install.sh` | **MIT** | The installer for the agent skill (`curl … \| bash`) |
| `README.md`, `LICENSING.md`, `SELF_HOSTING.md` | **MIT** | So they can be quoted and adapted freely |

The folder `LICENSE` files in `apps/web`, `apps/api`, `apps/mcp`,
`packages/shared` and `packages/ads` repeat the root license, for when a
folder is read on its own.

Third-party code and assets keep their own licenses; see
[`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The OpenDocs name and
logo aren't covered by any of these licenses; see
[`TRADEMARKS.md`](TRADEMARKS.md).

## Related repositories

| Repository | License |
| --- | --- |
| [opendocs-cc/opendocs-cli](https://github.com/opendocs-cc/opendocs-cli) | MIT |
| [opendocs-cc/doc-converter](https://github.com/opendocs-cc/doc-converter) | FSL-1.1-MIT |
| [opendocs-cc/opendocs-extension](https://github.com/opendocs-cc/opendocs-extension) | MIT |
| [opendocs-cc/skills](https://github.com/opendocs-cc/skills) | MIT |

## What FSL-1.1-MIT means

The [Functional Source License](https://fsl.software) lets you use, copy,
change and share the software for any purpose except a competing use: making
it available to others as a commercial product or service that substitutes
for opendocs.cc. Using it inside your own company, for research, or to build
something that isn't a competing service is fine.

Two years after each version is released, that version is also available
under the MIT license (the "Grant of Future License" in `LICENSE`).
