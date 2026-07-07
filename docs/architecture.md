# Architecture

## Overview

PlanSync is a CLI tool that enforces file-level access boundaries in a shared git repository. It uses the existing filesystem permission model — no server, no proxy, no custom API. The design follows three principles:

1. **GitHub is the source of truth.** The plan, scope manifests, and context files are plain files committed to the repo.
2. **No tooling lock-in.** Scope enforcement happens at the OS level. Any editor, agent, or CLI tool hits standard `EACCES` errors.
3. **CI is the backstop.** Local permissions prevent accidents; the GitHub Action prevents deliberate scope drift.

## Data flow

```
┌─────────────────────────────────────────────────────────────┐
│                         Owner                                │
│  Agent reads AGENTS.md → writes .plansync/plan.json          │
│  plansync delegate → assign tasks → push to GitHub          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   GitHub (source of truth)                    │
│  ● Issues per task (scope, criteria, deps)                   │
│  ● Project board (status columns)                            │
│  ● .plansync/scopes/<task-id>.json  (machine-readable)       │
│  ● .plansync/plan.json              (full plan + assignments) │
│  ● .plansync/admin-context.md       (planning instructions)  │
│  ● PROJECT_PLAN.md                  (human-readable)         │
└────────────────────────┬────────────────────────────────────┘
                         │
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
      Collaborator    AI Agent      CI (GitHub Actions)
      git pull        git pull      ├─ scope-check (per PR)
      plansync sync   plansync sync └─ silence-detection (daily)
           │              │
           ▼              ▼
     Root context:      Root context:
     AGENTS.md          AGENTS.md
     CLAUDE.md          CLAUDE.md
     .cursorrules       .cursorrules
     ...                ...
     + .plansync/       + .plansync/
       context/<name>/    context/<name>/
     
     Filesystem:       Filesystem:
     chmod 0o644       chmod 0o644
     (writable)        (writable)
     for assigned      for assigned
     files only        files only
```

## Core modules

### `src/lib/config.js`
Reads/writes `.plansync/config.json`. Stores auth token and repo metadata. Locates the git root by walking up from `cwd`.

### `src/lib/github.js`
Wraps Octokit. Handles device-code OAuth (built-in Client ID — no setup needed), creates authenticated client, parses GitHub remotes.

### `src/lib/llm.js`
Optional LLM integration for drafting plans. Generates and revises structured plans using a JSON prompt. Validates output before returning.

### `src/lib/planSchema.js`
Zod schema for plan validation. Ensures unique task IDs, valid scope globs, and correct dependency references.

### `src/lib/scopeCheck.js`
Pure function: given file paths and glob patterns, returns matched and unmatched subsets. Shared between the CLI and the GitHub Action.

### `src/lib/contextFiles.js`
Renders per-user context files from plan templates. Generates 7 agent file formats (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, `GEMINI.md`, `.continue/rules/00-plansync.md`). Files are written to project root for agent auto-discovery plus `.plansync/context/<username>/` as backup. Supports custom templates via `.plansync/templates/`.

### `src/lib/permissions.js`
Walks the repo tree and applies `chmod`. Only files matching the user's assigned task scopes get write permission. Skips `.git`, `node_modules`, and `.plansync`.

## Commands

### `plansync init`
Authenticates with GitHub, scaffolds CI workflows and post-merge hook, writes `AGENTS.md` with planning instructions, writes admin planning instructions to `.plansync/admin-context.md` (committed), adds root context files to `.gitignore`.

### `plansync delegate [--auto] [--update]`
Reads `.plansync/plan.json`, fetches repo collaborators, shows a numbered reassignment menu. Only the repo admin can delegate (owner-only guard). Creates GitHub Issues, a Project board, scope manifests, saves assignments to plan.json, and commits/pushes. Use `--auto` for round-robin defaults. Use `--update` to re-delegate after modifying the plan.

### `plansync sync [--user <name>] [--supervisor] [--reset]`
Role-aware: auto-detects admin status via GitHub API.
- **Admin:** all files writable, root `AGENTS.md` gets planning + assigned tasks + all-tasks overview table
- **Supervisor:** all files writable, context only to `.plansync/context/<name>/`
- **Collaborator:** assigned files writable, rest read-only. Context files to project root + `.plansync/context/<name>/`

### `plansync status`
Prints the plan with live GitHub Issue states, blocking chains, and summary counts.

### `plansync clean`
Removes all PlanSync files, hooks, markers, and gitignore entries.

## Scope enforcement

The `sync` command determines scope by:

1. Resolving username: `--user` flag > `PLANSYNC_USER` env > GitHub API
2. Auto-detecting admin status via GitHub API (unless `--supervisor`)
3. Reading the current user's assigned tasks from `.plansync/plan.json`
4. Collecting the union of all `scope` glob patterns from those tasks
5. Walking the entire repo (excluding `.git/`, `node_modules/`, `.plansync/`)
6. For each file: if it matches any scope glob → `chmod 0o644`, else → `chmod 0o444`

This is **not** adversarial security — the same OS user can undo a `chmod`. It's a guard against **accidental** scope drift, which is the primary failure mode for AI agents.

## Context files

When `plansync sync` runs, it generates per-user context files containing only the tasks assigned to that user:

| File | Agents |
|---|---|
| `AGENTS.md` | OpenCode, Claude Code, Codex CLI, Cursor, GitHub Copilot, VS Code AI, Devin, Aider, Zed, Warp, JetBrains Junie, Gemini CLI, Goose, Factory, Amp, Jules + 14 more |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf (Codeium) |
| `GEMINI.md` | Google Gemini CLI |
| `.continue/rules/00-plansync.md` | Continue.dev |

Files are written to the **project root** for agent auto-discovery, plus `.plansync/context/<username>/` as a backup. Root files are gitignored so each team member gets their own view.

Custom templates: drop a `.tmpl` file into `.plansync/templates/` and it will be rendered for every user at sync time. Templates receive `{{username}}`, `{{userTaskCount}}`, `{{taskList}}`, `{{projectTitle}}`, `{{projectDescription}}`, and `{{scopeGlobs}}` variables.

## GitHub Actions

### scope-check
Triggered on `pull_request`. Runs `scopeCheck.js` against the diff. Comments on the PR listing any files outside the task's declared scope. Fails the check if violations are found.

### silence-detection
Runs on a weekday schedule. Checks each in-progress task for activity in the last 3 days. Comments on stale issues. Flags blocking tasks that are stalling dependents.
