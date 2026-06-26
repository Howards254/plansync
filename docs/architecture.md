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
│  plansync plan "build app" → review → approve               │
│  plansync delegate → assign tasks → push to GitHub          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   GitHub (source of truth)                    │
│  ● Issues per task (scope, criteria, deps)                   │
│  ● Project board (status columns)                            │
│  ● .plansync/scopes/<task-id>.json  (machine-readable)       │
│  ● .plansync/plan.json              (full plan)              │
│  ● CLAUDE.md, .cursorrules, ...     (per-agent context)      │
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
    Filesystem:       Filesystem:
    chmod 0o444       chmod 0o444
    (read-only)       (read-only)
    for files         for files
    outside scope     outside scope
```

## Core modules

### `src/lib/config.js`
Reads/writes `.plansync/config.json`. Stores auth token and repo metadata. Locates the git root by walking up from `cwd`.

### `src/lib/github.js`
Wraps Octokit. Handles device-code OAuth, creates authenticated client, parses GitHub remotes.

### `src/lib/llm.js`
Wraps the Anthropic SDK. Generates and revises project plans using a structured JSON prompt. Validates output before returning.

### `src/lib/planSchema.js`
Zod schema for plan validation. Ensures unique task IDs, valid scope globs, and correct dependency references.

### `src/lib/scopeCheck.js`
Pure function: given file paths and glob patterns, returns matched and unmatched subsets. Shared between the CLI and the GitHub Action.

### `src/lib/contextFiles.js`
Renders per-agent context files from plan templates. One file per agent tool format (`CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`, `AGENTS.md`).

### `src/lib/permissions.js`
Walks the repo tree and applies `chmod`. Only files matching the user's assigned task scopes get write permission. Skips `.git`, `node_modules`, and `.plansync`.

## Scope enforcement

The `sync` command determines scope by:

1. Reading the current user's GitHub username (via Octokit or `--user` flag)
2. Finding all tasks where `assignedTo === username`
3. Collecting the union of all `scope` glob patterns from those tasks
4. Walking the entire repo (excluding `.git/`, `node_modules/`, `.plansync/`)
5. For each file: if it matches any scope glob → `chmod 0o644`, else → `chmod 0o444`

This is **not** adversarial security — the same OS user can undo a `chmod`. It's a guard against **accidental** scope drift, which is the primary failure mode for AI agents.

## GitHub Actions

### scope-check
Triggered on `pull_request`. Runs `scopeCheck.js` against the diff. Comments on the PR listing any files outside the task's declared scope. Fails the check if violations are found.

### silence-detection
Runs on a weekday schedule. Checks each in-progress task for activity in the last 3 days. Comments on stale issues. Flags blocking tasks that are stalling dependents.
