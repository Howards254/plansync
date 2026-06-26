# Frequently Asked Questions

## Does this replace GitHub Projects or Issues?

No. PlanSync uses Issues and Projects as the collaboration surface. It creates them automatically from the plan, but you continue to use GitHub normally for discussions, status updates, and project management.

## What if my team uses different AI tools?

PlanSync generates context files for Claude Code (`CLAUDE.md`), Cursor (`.cursorrules`), Copilot (`copilot-instructions.md`), and OpenCode (`AGENTS.md`). Each tool gets the format it expects. Adding a fifth tool is a one-function change in `contextFiles.js`.

## What happens if the LLM call fails?

The `plan` command catches LLM errors and asks if you want to retry. Your Anthropic API key is never sent anywhere except directly to Anthropic's API — PlanSync doesn't proxy it through any server.

## Is the scope enforcement secure?

The `chmod`-based enforcement stops **accidental** writes outside a task's scope. It is not an adversarial security boundary — the same OS user that owns the file can revert the permission. The GitHub Action scope check is the real backstop for intentional violations.

## What happens on merge conflicts?

PlanSync doesn't change how git handles merges. If two tasks touch the same file, standard git merge conflict resolution applies. Scope manifests are designed to prevent this by keeping task boundaries non-overlapping.

## Can I use PlanSync without an LLM?

The `plan` command requires an Anthropic API key. However, you can write `.plansync/plan.json` manually (it validates against the Zod schema) and skip straight to `plansync delegate`.

## Does PlanSync send my code anywhere?

No. The source code never leaves your machine or your CI runner. The Anthropic API call in `plansync plan` sends only your project description (not your code) to generate the plan structure.

## Can I have overlapping scopes?

Yes. Multiple tasks can include the same files. In that case, every assignee gets write access to those files. The scope check will not flag changes to overlapping files.

## What if a collaborator doesn't run `plansync sync`?

They'll have write access to everything until they run it. The post-merge git hook (installed by `plansync init`) runs it automatically. CI will still flag any scope violations in their PRs.
