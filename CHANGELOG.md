# Changelog

## 0.2.4 — 2026-06-27

- **README rewrite** — comprehensive guide with installation, quick start (new + existing project), architecture, all commands, authentication, context files, FAQ, and contributing
- **LICENSE** — updated copyright to Howards254

## 0.2.3 — 2026-06-27

- **install.html** — added "Next steps after init" with two-column guide (new project vs existing project)
- **docs.html** — each command now has its own section with detailed explanation and a concrete terminal example
- **Sidebar navigation** — docs.html sidebar links directly to each command anchor

## 0.2.2 — 2026-06-27

- **Website redesign** — new workflow.html guide (new project vs existing project), streamlined install and docs pages
- **Auto-version badge** — homepage fetches latest version from npm registry automatically
- **Active nav links** — current page highlighted in site navigation

## 0.2.1 — 2026-06-27

- **Interactive browser dialog** — countdown 5s then auto-opens browser; user can open, copy URL, or cancel
- **Fixed delegation reassignment** — case-insensitive task ID matching; reassignments no longer overwritten by re-distribution
- **Fixed printf bug** — `%s` replaced with template literals throughout
- **Untracked config.json** — `git rm --cached` removes previously committed `.plansync/config.json`
- **Fixed scopes** — `['repo', 'project']` so Issues + Project board both work
- **Deprecation suppressed** — Octokit uses `X-GitHub-Api-Version: 2022-11-28`
- **Status table** — header separators aligned

## 0.2.0 — 2026-06-27

- **Fixed device flow scopes** — removed invalid `issues` and `project` scopes; `repo` alone covers everything
- **Fixed project board creation** — uses `repoData.owner.node_id` instead of repo node ID for ownerId
- **Auto-distribute delegation** — tasks are assigned round-robin to collaborators; review and reassign before committing
- **Pre-assigned plans** — if `plan.json` tasks have `assignedTo` set, uses those directly
- **Gitignore secrets** — `.plansync/config.json` added to `.gitignore` during init; excluded from git add in delegate
- **`plansync clean`** — new command to remove all PlanSync files, markers, and hooks

## 0.1.4 — 2026-06-27

- **Device flow is primary** — press Enter to authenticate in your browser; paste a PAT as fallback
- **Built-in Client ID** included — no setup whatsoever for the default auth path

## 0.1.3 — 2026-06-27

- **PAT-first auth** — `plansync init` prompts for a Personal Access Token; press Enter to fall back to device flow
- **Built-in Client ID** — no OAuth App setup needed for device flow; a default Client ID is bundled
- **verifyPAT()** — validates token by calling GitHub API and returns the authenticated username

## 0.1.2 — 2026-06-27

- **Interactive client ID prompt** — `plansync init` no longer requires `PLANSYNC_GITHUB_CLIENT_ID` env var; prompts for it if missing and saves to config
- **Context files for 7 agents** — AGENTS.md (28+), CLAUDE.md, .cursorrules, .windsurfrules, copilot-instructions.md, GEMINI.md, .continue/rules/00-plansync.md
- **Website cleanup** — removed Anthropic/LLM/API-key-first messaging; agent-native flow is the lead story

## 0.1.0 — 2026-06-26

Initial release.

- `plansync init` — GitHub auth, workflow scaffolding, git hook install
- `plansync plan` — LLM-powered plan generation with revision loop
- `plansync delegate` — Creates Issues, Project board, scope manifests, context files
- `plansync status` — Plan overview with live GitHub Issue states
- `plansync sync` — Scope enforcement via filesystem permissions
- GitHub Actions: scope-check (PR) and silence-detection (scheduled)
- Context files for Claude Code, Cursor, Copilot, and OpenCode
