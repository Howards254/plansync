# PlanSync

**Coordination and accountability layer for AI-assisted development teams.**

PlanSync lets a project owner split a repo into scoped sections, assign each section to a developer or AI agent, and enforce boundaries at the filesystem level. Every agent can read the whole project for context, but can only write to the files they're assigned to.

```sh
npm install -g plansync
plansync init              # authenticate with GitHub
plansync plan "build an auth system"   # generate a structured plan
plansync delegate          # create Issues, assign tasks, set up the board
plansync sync              # apply read-only permissions for your scope
```

No server, no proxy, no API gate. Just a CLI tool, a git hook, and a GitHub Action.

## How it works

1. **Plan** — Describe your project. PlanSync uses an LLM to generate a structured plan with tasks, file-scope globs, dependencies, and acceptance criteria. You review, revise, approve.
2. **Delegate** — Assign tasks to collaborators. PlanSync creates GitHub Issues, a Project board, and auto-generates per-agent context files (`CLAUDE.md`, `.cursorrules`, etc.) that tell each agent exactly what it can touch.
3. **Enforce** — The `sync` command walks the repo and sets `chmod 0o444` (read-only) on everything outside your assigned scope, `chmod 0o644` (writable) on files you own. Your editor, Claude Code, Cursor, or any tool hits `EACCES` if it tries to write where it shouldn't.
4. **Watch** — A GitHub Action checks every PR for scope violations. A scheduled action flags stalled tasks.

## Commands

| Command | Description |
|---|---|
| `plansync init` | Authenticate with GitHub, scaffold workflows and git hook |
| `plansync plan <description>` | Generate a structured project plan via LLM |
| `plansync delegate` | Write plan to GitHub Issues, Project board, and context files |
| `plansync status` | Show plan with live GitHub Issue states |
| `plansync sync [--user <username>]` | Apply read-only permissions for your assigned scope |

## Requirements

- Node.js 18+
- A GitHub account
- An Anthropic API key (`ANTHROPIC_API_KEY` environment variable)
- A GitHub OAuth App client ID (`PLANSYNC_GITHUB_CLIENT_ID`)

## License

MIT
