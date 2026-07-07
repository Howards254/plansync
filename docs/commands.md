# Commands Reference

## `plansync init`

Authenticate with GitHub and scaffold PlanSync on a repository.

```
plansync init
```

**What it does:**
- Verifies the current directory is a git repo with a GitHub remote
- Runs the GitHub device-code OAuth flow (built-in Client ID — no setup needed)
- Saves token to `.plansync/config.json` (auto-gitignored)
- Copies workflow templates to `.github/workflows/`
- Installs a post-merge git hook
- Writes `AGENTS.md` with planning instructions for your coding agent
- Writes admin planning instructions to `.plansync/admin-context.md` (committed)
- Adds root context files to `.gitignore`

**Environment variables:**
- `PLANSYNC_GITHUB_CLIENT_ID` (optional) — Custom GitHub OAuth App client ID

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

**Note:** Requires an API key set in the environment.

---

## `plansync delegate [--auto] [--update]`

Write the approved plan to GitHub Issues, Project board, and scope manifests. Only repository admins can run this command.

```
plansync delegate
plansync delegate --auto
plansync delegate --update
```

**What it does:**
1. Reads `.plansync/plan.json`
2. Fetches repo collaborators
3. Displays an interactive numbered menu for task reassignment (or `--auto` for round-robin)
4. Creates a GitHub Issue per task with scope + acceptance criteria
5. Links task dependencies via issue comments
6. Creates a GitHub Project (v2) board and adds issues
7. Writes scope manifests to `.plansync/scopes/<task-id>.json`
8. Saves assignments back to `.plansync/plan.json`
9. Commits and pushes to GitHub

**Flags:**
- `--auto` — Skip interactive reassignment menu, use round-robin defaults (approval prompt still shown)
- `--update` — Re-delegate after modifying the plan. New tasks create new Issues, changed tasks update existing Issues, removed tasks close their Issues.

**Owner-only guard:** Checks GitHub API permissions — only repo admins can delegate. Collaborators are blocked with a message to ask the repo owner.

---

## `plansync status`

Print the current plan and live task states from GitHub.

```
plansync status
```

Displays a table of tasks with status, assignee, scope, live GitHub Issue state (open/closed), and blocking dependency chains. Shows a summary count.

---

## `plansync sync [--user <name>] [--supervisor] [--reset]`

Generate per-user context files and apply scope permissions. Role-aware: auto-detects if you're the repo admin.

```
plansync sync                      # admin auto-detect
plansync sync --user janedoe       # collaborator
plansync sync --supervisor         # keep all files writable, only context
plansync sync --reset              # restore all files to writable
```

**What it does:**
1. Resolves username: `--user` flag > `PLANSYNC_USER` env > GitHub API (requires token)
2. Reads `.plansync/plan.json`
3. Auto-detects admin status via GitHub API (unless `--supervisor` is set)
4. **Admin mode:** All files stay writable. Root `AGENTS.md` gets planning instructions, your assigned tasks, and an all-tasks overview table. Context also written to `.plansync/context/<name>/`.
5. **Supervisor mode:** All files stay writable. Context files written only to `.plansync/context/<name>/` (root untouched).
6. **Collaborator mode:** Files matching your assigned scope → `chmod 644` (writable). Everything else → `chmod 444` (read-only). Context files written to project root (auto-discovered by agents) + `.plansync/context/<name>/`.
7. Skips `.git/`, `node_modules/`, `.plansync/`

**Context files generated:**
- `AGENTS.md` — OpenCode, Cursor, GitHub Copilot, VS Code AI, Devin, Aider, +24 more
- `CLAUDE.md` — Claude Code
- `.cursorrules` — Cursor
- `.github/copilot-instructions.md` — GitHub Copilot
- `.windsurfrules` — Windsurf (Codeium)
- `GEMINI.md` — Google Gemini CLI
- `.continue/rules/00-plansync.md` — Continue.dev

**Flags:**
- `--user <username>` — Specify your GitHub username
- `--supervisor` — Keep all files writable, only generate context files
- `--reset` — Restore all files to writable (undo previous sync)

**Environment variables:**
- `PLANSYNC_USER` — Set your GitHub username (takes precedence over API lookup)

---

## `plansync clean`

Completely remove PlanSync from a project.

```
plansync clean
```

**What it does:**
- Deletes `.plansync/` directory
- Removes workflow files from `.github/workflows/`
- Removes the post-merge git hook
- Removes `PROJECT_PLAN.md`
- Strips `<!-- plansync -->` markers from context files
- Removes PlanSync entries from `.gitignore`

After running `clean`, you can start fresh with `plansync init`.
