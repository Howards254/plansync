# Frequently Asked Questions

## Does this replace GitHub Projects or Issues?

No. PlanSync uses Issues and Projects as the collaboration surface. It creates them automatically from the plan, but you continue to use GitHub normally for discussions, status updates, and project management.

## What if my team uses different AI tools?

PlanSync generates per-user context files for 7 agent tools at sync time. Files are written to the **project root** (for agent auto-discovery) plus `.plansync/context/<username>/` as a backup:

| File | Agents |
|---|---|
| `AGENTS.md` | OpenCode, Claude Code, Cursor, GitHub Copilot, Devin, Aider, +24 more |
| `CLAUDE.md` | Claude Code |
| `.cursorrules` | Cursor |
| `.github/copilot-instructions.md` | GitHub Copilot |
| `.windsurfrules` | Windsurf (Codeium) |
| `GEMINI.md` | Google Gemini CLI |
| `.continue/rules/00-plansync.md` | Continue.dev |

Adding a new tool means dropping a `.tmpl` file into `.plansync/templates/`.

## Is the scope enforcement secure?

The `chmod`-based enforcement stops **accidental** writes outside a task's scope. It is not an adversarial security boundary — the same OS user that owns the file can revert the permission. The GitHub Action scope check is the real backstop for intentional violations.

## Does PlanSync work on Windows?

Yes — macOS, Linux, and Windows are all supported. Windows users should install [Git for Windows](https://git-scm.com/download/win) and use Git Bash for full functionality. File permission enforcement is weaker on Windows (sets the read-only attribute rather than full Unix ACLs), so rely on the CI scope-check Action as the real backstop.

## How do I update the plan after delegation?

Edit `.plansync/plan.json` (or have your agent rewrite it), then run `plansync delegate` again. It always deduplicates — matching task IDs against existing Issues. New tasks create new Issues, changed tasks update existing Issues, removed tasks close their Issues. For major rewrites, use `plansync clean` followed by a fresh `plansync delegate`.

## Can collaborators run `plansync delegate`?

No. Only repository admins (owners) can delegate plans. PlanSync checks GitHub API permissions and blocks non-admins. Collaborators can run `plansync sync` to lock their scope and get context files, but cannot delegate.

## Can the admin write to other people's tasks?

Yes. Use `plansync sync --supervisor` to keep all files writable while still getting your context files. PlanSync also auto-detects admin status — admins get a rich `AGENTS.md` with planning instructions, their assigned tasks, and an all-tasks overview table.

## How does the admin auto-detect work?

`plansync sync` checks the GitHub API for your permission level. If you're an admin, all files stay writable and root `AGENTS.md` gets expanding planning instructions + overview of every collaborator's tasks. Non-admins get scoped permissions and only their own tasks in context files.

## Can I write a plan manually?

Yes. The plan file (`.plansync/plan.json`) is a simple JSON document that validates against a Zod schema. Your coding agent can write it directly by reading `AGENTS.md` — or write it by hand and run `plansync delegate`.

## Does PlanSync send my code anywhere?

No. The source code never leaves your machine or your CI runner.

## Can I have overlapping scopes?

Yes. Multiple tasks can include the same files. In that case, every assignee gets write access to those files. The scope check will not flag changes to overlapping files.

## What if a collaborator doesn't run `plansync sync`?

They'll have write access to everything until they run it. The post-merge git hook (installed by `plansync init`) runs `plansync sync` automatically after every pull — updating both scope permissions and context files. CI will still flag any scope violations in their PRs.

## What happens if a collaborator tries to write outside their scope?

They'll get an `EACCES` permission error from their editor or tool. The CI scope-check Action also flags scope violations in PRs as a backstop. If they need to write outside their scope, they should either request a plan update from the admin or use `plansync sync --reset` to restore all files to writable.
