# Changelog

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
