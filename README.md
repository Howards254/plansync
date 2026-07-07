# PlanSync

[![npm version](https://img.shields.io/npm/v/plansync)](https://www.npmjs.com/package/plansync)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

**Coordination and accountability layer for AI-assisted development teams.**

> **Website:** [plansync.freedev.app](https://plansync.freedev.app) — install guide, docs, FAQ, and full command reference

PlanSync lets a project owner split a repo into scoped tasks, assign each task to a developer or AI agent, and enforce boundaries at the filesystem level. Every agent can read the whole project for context, but can only write to the files they're assigned to.

No server. No proxy. No API gate. Just a CLI tool, a git hook, and a GitHub Action.

```sh
npm install -g plansync
cd your-project
plansync init              # authenticate with GitHub
```

---

## Installation

```sh
npm install -g plansync
```

**Prerequisites:** Node.js 18+, a GitHub repo with a remote named `origin`.

**Platform support:** macOS, Linux, and Windows (with Git Bash recommended for full functionality).

No API keys required. A built-in GitHub OAuth Client ID is included — device flow works out of the box.

---

## Platform support

| Platform | Support level | Notes |
|----------|---------------|-------|
| **macOS** | ✅ Full | All features work out of the box |
| **Linux** | ✅ Full | All features work out of the box |
| **Windows** | ✅ Full | Use Git Bash for best experience. Post-merge hook requires Git Bash. |

**Windows users:**
- Install [Git for Windows](https://git-scm.com/download/win) which includes Git Bash
- Run PlanSync commands from Git Bash (not cmd.exe or PowerShell) for full functionality
- File permissions enforcement is weaker on Windows — rely on CI scope-check as the backstop
- Browser opening and clipboard copy now work natively on Windows

---

## Quick start

### Starting a new project

```sh
# 1. Install and init
npm install -g plansync
cd my-new-project
git init && git add -A && git commit -m "first"
gh repo create my-new-project --push --public
plansync init
# Press Enter → browser opens → authorize → done

# 2. Tell your coding agent to read AGENTS.md and write .plansync/plan.json
#    The agent creates tasks with scope globs, dependencies, and acceptance criteria

# 3. Push the plan to GitHub
plansync delegate
# Numbered menu: reassign tasks per collaborator or Enter to approve
# Creates Issues + Project board + scope manifests

# 4. Lock scope permissions and get your task context
plansync sync
# Only your assigned files are writable
# Context files generated at .plansync/context/<username>/
```

### Adopting an existing project

```sh
# 1. Install and init
npm install -g plansync
cd existing-project
plansync init

# 2. Describe your next milestone to your agent
#    It reads AGENTS.md and writes .plansync/plan.json

# 3. Push to GitHub
plansync delegate

# 4. Lock scope
plansync sync --user your-username

# Undo later with:
plansync clean
```

See the full walkthrough at **[plansync.freedev.app/workflow.html](https://plansync.freedev.app/workflow.html)**.

---

## How it works

PlanSync operates in four layers:

1. **Plan generation** — After `plansync init` writes `AGENTS.md`, your coding agent reads it and writes `.plansync/plan.json` with tasks, file-scope globs, dependencies, and acceptance criteria. The `plansync plan` command (requires `ANTHROPIC_API_KEY`) can also draft a plan via LLM, but this is entirely optional — your agent can write the plan directly.

2. **GitHub synchronization** — `plansync delegate` reads the plan and creates GitHub Issues (one per task), a Project v2 board, and scope manifests in `.plansync/scopes/`. A numbered reassignment menu lets you quickly move tasks to specific collaborators using inputs like `"1=b"`, `"1,3=b"`, or `"all=a"`. Use `--auto` to skip reassignment but still approve. On approval, assignments are written back to `.plansync/plan.json` for downstream use. If a username is not a collaborator, the issue is created unassigned with a note.

3. **Scope enforcement** — `plansync sync` walks the repo and sets `chmod 644` (writable) on files matching your assigned scopes and `chmod 444` (read-only) on everything else. Your editor, Claude Code, Cursor, or any tool hits `EACCES` if it tries to write outside your scope. Skips `.git/`, `node_modules/`, and `.plansync/`. Use `--reset` to restore all files to writable. Sync also generates per-user context files at `.plansync/context/<username>/` containing only your assigned tasks.

4. **CI monitoring** — A GitHub Action (`scope-check.yml`) checks every PR for scope violations. A scheduled action (`silence-detection.yml`) flags stalled tasks. The CI action is the real backstop; local permissions are an opt-in convenience.

---

## Commands

| Command | Description |
|---|---|
| `plansync init` | Authenticate with GitHub, scaffold CI workflows and post-merge hook, write `AGENTS.md`, gitignore credentials |
| `plansync delegate [--auto] [--update]` | Read `.plansync/plan.json` → numbered reassignment menu → create Issues, Project board, scope manifests → commit and push. Only repo admins can delegate. |
| `plansync status` | Print plan with live GitHub Issue states, blocking chains, summary counts |
| `plansync sync [--user <name>] [--reset] [--supervisor]` | Lock filesystem permissions + generate per-user context files at `.plansync/context/<name>/` |
| `plansync plan <description>` | (Optional) Draft a plan via LLM — requires `ANTHROPIC_API_KEY` |
| `plansync clean` | Remove all PlanSync traces from the project |

Use `--help` on any command for full options.

### Delegate flags

- `--auto` — Skip interactive reassignment menu, use round-robin defaults (still shows approval prompt)
- `--update` — Update existing Issues instead of creating duplicates. Use this when you've modified the plan and want to re-delegate. New tasks create new Issues, changed tasks update existing Issues, removed tasks close their Issues.

### Sync flags

- `--user <name>` — Specify GitHub username (auto-detected if omitted)
- `--reset` — Restore all files to writable (undo previous sync)
- `--supervisor` — Supervisor mode: keep all files writable, only generate context files. Use this when you're the project owner and want to oversee all tasks without scope restrictions.

---

## Updating plans after delegation

Plans change. When you need to modify the plan after delegation:

1. **Edit `.plansync/plan.json`** — Add, remove, or modify tasks. You can also regenerate it with `plansync plan` if using the LLM.

2. **Re-delegate with `--update`**:
   ```sh
   plansync delegate --update
   ```
   This intelligently updates GitHub:
   - **New tasks** → create new Issues
   - **Changed tasks** → update existing Issue body, assignee, and labels
   - **Removed tasks** → close their Issues with a comment explaining removal

3. **Major rewrites** — If you've made sweeping changes (reordered all tasks, changed scope structure), use `plansync clean` followed by a fresh `plansync delegate` for a clean slate.

**Note:** Only repository admins can run `plansync delegate`. Collaborators with push access can run `plansync sync` to lock their scope, but cannot delegate new plans.

---

## Supervisor mode for project owners

As the project owner, you may want to:
- Oversee all tasks without scope restrictions
- Review and modify any file in the project
- Supervise collaborators while they work within their assigned scopes

Use `--supervisor` mode:

```sh
plansync sync --supervisor
```

This keeps all files writable for you while still generating your context files at `.plansync/context/<your-username>/`. You can read and write anywhere in the project, while collaborators remain locked to their assigned scopes.

**When to use supervisor mode:**
- You're the project owner reviewing all work
- You need to make cross-cutting changes (refactoring, bug fixes)
- You're coordinating between multiple collaborators

**When to use regular sync:**
- You're assigned specific tasks and want to stay within your scope
- You want the same protection as collaborators (preventing accidental writes outside your scope)

---

## Authentication

PlanSync uses **GitHub device flow** as the primary authentication method:

1. Run `plansync init`
2. Press **Enter** → 5-second countdown → browser opens automatically
3. Enter the code shown in terminal, click **Authorize**
4. Token saved to `.plansync/config.json` and added to `.gitignore`

**PAT fallback:** Paste a [Personal Access Token](https://github.com/settings/tokens/new) with `repo` and `project` scopes at the prompt instead.

**For collaborators (sync only):** Use `--user <name>` or `PLANSYNC_USER` environment variable. No token needed — scope enforcement is purely local filesystem permissions.

---

## Context files

PlanSync generates per-user context files when you run `plansync sync`. Each set contains only the tasks assigned to you, across all supported agent tools:

| File | Agents |
|---|---|
| `AGENTS.md` | OpenCode, Codex CLI, Cursor, GitHub Copilot, Devin, Aider, Zed, Warp, JetBrains Junie, Gemini CLI, Goose, Factory, Amp, Jules + 14 more |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf (Codeium) |
| `GEMINI.md` | Google Gemini CLI |
| `.continue/rules/00-plansync.md` | Continue.dev |

Files are written to `.plansync/context/<username>/` and contain `<!-- plansync -->` / `<!-- end-plansync -->` markers. This directory is gitignored so each team member gets their own view of tasks.

To use: tell your agent to read `.plansync/context/<your-username>/` after running `plansync sync`.

The root `AGENTS.md` (written by `plansync init`) always contains the project planning instructions for the admin's agent — it is not overwritten by sync.

**Adding more agents:** Drop a template file into `.plansync/templates/` and it will be rendered for every user at sync time. The filename becomes the output path (e.g., `.plansync/templates/.my-agent.md.tmpl` → `.plansync/context/<user>/.my-agent.md`). Templates receive `{{username}}`, `{{userTaskCount}}`, `{{taskList}}`, `{{projectTitle}}`, `{{projectDescription}}`, and `{{scopeGlobs}}` variables.

---

## FAQ

**Do collaborators need to install anything?** Yes — `npm install -g plansync` and `plansync sync`. No API keys or GitHub tokens needed.

**Do I need an Anthropic API key?** No. `plansync plan` is optional. Your agent writes `.plansync/plan.json` directly by reading `AGENTS.md`.

**Can I undo everything?** Yes — `plansync clean` removes all traces and restores your repo to its pre-PlanSync state.

**What if I already committed `.plansync/config.json`?** PlanSync's `init` command automatically runs `git rm --cached` to untrack it and adds it to `.gitignore`.

**How does my agent know which task is mine?** After `plansync sync`, your agent's context file is at `.plansync/context/<username>/AGENTS.md`. Tell your agent to read that file. It contains only the tasks assigned to you.

**Does this work with any coding agent?** Yes — 28+ agents read `AGENTS.md` natively. PlanSync also generates tool-specific files for Claude Code, Cursor, Copilot, Windsurf, Gemini CLI, and Continue.dev.

**Does it work on Windows?** Yes — macOS, Linux, and Windows are all supported. Windows users should install [Git for Windows](https://git-scm.com/download/win) and use Git Bash for full functionality. File permission enforcement is weaker on Windows; rely on the CI scope-check as the backstop.

**Can collaborators run `plansync delegate`?** No. Only repository admins (owners) can delegate plans. This prevents collaborators from accidentally overwriting the plan. Collaborators can run `plansync sync` to lock their scope and get context files.

**What if I change my mind after delegating?** Edit `.plansync/plan.json` and run `plansync delegate --update`. This updates existing Issues instead of creating duplicates. For major rewrites, use `plansync clean` followed by a fresh `plansync delegate`.

**Can the admin write to other people's tasks?** Yes. Use `plansync sync --supervisor` to keep all files writable while still getting your context files. This lets you oversee all tasks without scope restrictions.

**What happens if a collaborator tries to write outside their scope?** They'll get an `EACCES` permission error from their editor or tool. The CI scope-check Action also flags scope violations in PRs as a backstop.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. Key points:

- All tests pass: `npm test`
- Follow existing code style (no comments, no semicolons in JS, 2-space indent)
- PRs must pass CI

---

## License

MIT — see [LICENSE](LICENSE).
