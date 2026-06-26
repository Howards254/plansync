# Commands Reference

## `plansync init`

Authenticate with GitHub and scaffold the project brain.

```
plansync init
```

**What it does:**
- Verifies the current directory is a git repo with a GitHub remote
- Runs the GitHub device-code OAuth flow (requires `PLANSYNC_GITHUB_CLIENT_ID` env var)
- Saves token to `.plansync/config.json`
- Copies workflow templates to `.github/workflows/`
- Installs a post-merge git hook
- Creates a placeholder `PROJECT_PLAN.md`

**Environment variables:**
- `PLANSYNC_GITHUB_CLIENT_ID` (required) — Your GitHub OAuth App client ID

---

## `plansync plan <description>`

Generate a project plan from a description using an LLM.

```
plansync plan "Build a REST API with user auth"
```

**Interaction loop:**
1. LLM generates a structured plan (tasks, scope, dependencies, acceptance criteria)
2. Plan is displayed for review
3. You choose: **a**pprove, **e**dit with feedback, **r**egenerate, or **c**ancel
4. On approval, the plan is saved to `.plansync/plan.json`

**Environment variables:**
- `ANTHROPIC_API_KEY` (required) — Your Anthropic API key
- `PLANSYNC_CLAUDE_MODEL` (optional) — Claude model to use (default: `claude-sonnet-4-20250514`)

---

## `plansync delegate`

Write the approved plan to GitHub.

```
plansync delegate
```

**What it does:**
1. Reads `.plansync/plan.json`
2. Fetches repo collaborators
3. Prompts for task assignments (type a username or `auto`)
4. Creates a GitHub Issue per task with scope + acceptance criteria
5. Links task dependencies via issue comments
6. Creates a GitHub Project (v2) board and adds issues
7. Writes scope manifests to `.plansync/scopes/<task-id>.json`
8. Generates context files for each task (`CLAUDE.md`, `.cursorrules`, `copilot-instructions.md`, `AGENTS.md`)
9. Updates `PROJECT_PLAN.md`
10. Commits and pushes to GitHub

**Flags:**
- `--pr` — Open a PR instead of pushing directly

---

## `plansync status`

Print the current plan and live task states from GitHub.

```
plansync status
```

Displays a table of tasks with status, assignee, scope, and live GitHub Issue state. Shows blocking dependency chains.

---

## `plansync sync`

Recompute and reapply read-only file permissions for your assigned scope.

```
plansync sync
plansync sync --user your_github_username
```

**What it does:**
1. Determines your GitHub username (via API or `--user` flag or `PLANSYNC_USER` env var)
2. Reads `.plansync/plan.json`
3. Finds tasks assigned to you
4. Collects all scope globs from your tasks
5. Walks the repo tree:
   - Files matching your scope → `chmod 0o644` (writable)
   - Everything else → `chmod 0o444` (read-only)
6. Skips `.git/`, `node_modules/`, `.plansync/`

**Flags:**
- `--user <username>` — Specify your GitHub username (auto-detected if omitted)

**Environment variables:**
- `PLANSYNC_USER` — Set your GitHub username (takes precedence over API lookup)
