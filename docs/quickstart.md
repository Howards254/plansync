# Quickstart

This guide walks through the full PlanSync workflow: from an empty repo to a delegated plan with scope enforcement.

## Prerequisites

- Node.js 18+
- A GitHub repository (create one if you haven't)
- An [Anthropic API key](https://console.anthropic.com/)
- A [GitHub OAuth App](https://github.com/settings/developers) (create one — no callback URL needed for device flow)

## 1. Install

```sh
npm install -g plansync
```

## 2. Set up environment

```sh
export ANTHROPIC_API_KEY=sk-ant-...
export PLANSYNC_GITHUB_CLIENT_ID=your_github_oauth_client_id
```

## 3. Initialize

Navigate to your repo and run:

```sh
cd my-project
plansync init
```

This will:
- Start the GitHub device-code authentication flow (visit a URL, enter a code)
- Save your credentials to `.plansync/config.json`
- Copy GitHub Action workflows to `.github/workflows/`
- Install a `post-merge` git hook
- Create a placeholder `PROJECT_PLAN.md`

## 4. Generate a plan

Describe your project and let the LLM generate a structured plan:

```sh
plansync plan "A task management app with user authentication, project boards, and real-time notifications"
```

You'll see a proposed plan with tasks, scope definitions, dependencies, and acceptance criteria. You can:
- **a** — Approve and save
- **e** — Edit: provide feedback and get a revised plan
- **r** — Regenerate from scratch
- **c** — Cancel

## 5. Delegate

Push the plan to GitHub as Issues and a Project board:

```sh
plansync delegate
```

The command will:
1. Fetch repo collaborators
2. Ask you to assign each task to a collaborator (or type `auto` for automatic assignment)
3. Create a GitHub Issue per task with scope details and acceptance criteria
4. Create a GitHub Project (v2) board
5. Write scope manifests to `.plansync/scopes/`
6. Generate per-task context files (`CLAUDE.md`, `.cursorrules`, etc.)
7. Update `PROJECT_PLAN.md`
8. Commit and push everything

## 6. Sync permissions

As a collaborator, pull the latest and sync your scope:

```sh
git pull
plansync sync
```

This makes all files outside your assigned tasks read-only. Your tools will naturally refuse to write to them.

## 7. Check status

View the plan with live GitHub Issue states:

```sh
plansync status
```

## Example output

```
Task Management App
A task management app with user authentication, project boards, and notifications

Task      Status      Assignee      Scope
───      ──────      ────────      ─────

  T001  ◻ ready     alice         src/auth/**, tests/auth/**
       └ Issue #1 (open) — https://github.com/...

  T002  ◻ ready     bob           src/boards/**, tests/boards/**
       └ Issue #2 (open) — https://github.com/...

Summary: 0/3 done | 1 in progress | 0 blocked | 2 ready
```
