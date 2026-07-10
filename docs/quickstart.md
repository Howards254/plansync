# Quickstart

This guide walks through the full PlanSync workflow: from an empty repo to a delegated plan with scope enforcement and per-user context files.

## Prerequisites

- Node.js 18+
- A GitHub repository with a remote named `origin`

## 1. Install

```sh
npm install -g plansync
```

## 2. Initialize

Navigate to your repo and run:

```sh
cd my-project
plansync init
```

This will:
- Start the GitHub device-code authentication flow (Press Enter → browser opens → authorize → done)
- Save your credentials to `.plansync/config.json` (auto-gitignored)
- Copy GitHub Action workflows to `.github/workflows/`
- Install a `post-merge` git hook
- Write `AGENTS.md` with planning instructions for your coding agent
- Write admin planning instructions to `.plansync/admin-context.md` (committed)
- Add root context files to `.gitignore`

## 3. Plan the work

Your coding agent reads `AGENTS.md` and writes `.plansync/plan.json` with tasks, scope globs, dependencies, and acceptance criteria. For example:

```json
{
  "title": "Task Management App",
  "tasks": [
    {
      "id": "T001",
      "title": "Set up auth",
      "scope": ["src/auth/**"],
      "dependencies": [],
      "acceptanceCriteria": ["Users can sign up and log in"]
    },
    {
      "id": "T002",
      "title": "Build landing page",
      "scope": ["src/pages/**"],
      "dependencies": [],
      "acceptanceCriteria": ["Landing page shows task list"]
    }
  ]
}
```

You can also use the optional `plansync plan` command to draft a plan via LLM.

## 4. Delegate

Push the plan to GitHub as Issues and a Project board:

```sh
plansync delegate
```

Shows a numbered reassignment menu — input formats like `"1=b"`, `"1,3=b"`, or `"all=a"`:

```
Tasks:                              Collaborators:
 1. T001  Set up auth                a. howards254 (you)
 2. T002  Build landing page         b. janedoe

Reassign (e.g. "1=b" or "all=a"), or Enter to approve:
```

The command will:
1. Create a GitHub Issue per task with scope + acceptance criteria
2. Create a GitHub Project (v2) board
3. Write scope manifests to `.plansync/scopes/`
4. Save assignments back to `.plansync/plan.json`
5. Commit and push everything

Use `--auto` to skip the reassignment menu and use round-robin defaults.
Re-delegating after plan edits always deduplicates — matching task IDs against existing Issues. No special flag needed.

## 5. Sync permissions and context

As a collaborator, pull the latest and sync:

```sh
git pull
plansync sync your-username     # or: plansync sync --user your-username
```

This:
- Makes assigned files writable (`chmod 644`) and everything else read-only (`chmod 444`)
- Generates per-user context files to the **project root** (e.g. `AGENTS.md`, `CLAUDE.md`, `.cursorrules`) for agent auto-discovery
- Backs up context files to `.plansync/context/<username>/`

### Admin auto-detect

If you're the repo admin, `plansync sync` auto-detects it and keeps all files writable. Root `AGENTS.md` gets planning instructions, your assigned tasks, and an all-tasks overview table.

```sh
plansync sync
# Admin detected — all files stay writable
# Wrote admin context to root AGENTS.md
```

### Supervisor mode

Use `--supervisor` to keep all files writable while still generating context files (root untouched):

```sh
plansync sync --supervisor
```

### Reset permissions

Restore all files to writable:

```sh
plansync sync --reset
```

## 6. Check status

View the plan with live GitHub Issue states:

```sh
plansync status
```

Example output:

```
T001  ◻ ready    howards254  #1  open   src/auth/**
T002  ◻ ready    janedoe     #2  open   src/pages/**

Summary: 2 total · 2 ready · 0 blocked
```

## 7. Check your identity

Verify which GitHub identity is active:

```sh
plansync whoami
```

Resolves from `--user` flag, `PLANSYNC_USER` env var, or your GitHub token.

## 8. Clean up

Remove all PlanSync traces:

```sh
plansync clean
```
