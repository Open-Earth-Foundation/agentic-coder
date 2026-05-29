---
name: pull-request-standards
description: Draft PRs for agentic-coder. Base branch is main.
---

# pull-request-standards — agentic-coder

## Derive context

- Owner / repo: `git remote get-url origin` → `Open-Earth-Foundation/agentic-coder`.
- Head: `git rev-parse --abbrev-ref HEAD`.
- Base: **`main`** (this is a tool repo).

## Title

- ≤72 chars, imperative.
- Conventional-Commit-flavoured: `feat(adapter): add linear task source`.

## Body

```markdown
## Summary
1–3 sentences: what changed and why.

## Changes
- bullet list

## Verification
- how this was tested locally (e.g. `./run.sh task 1` against a test repo)

## Compatibility notes (if applicable)
- CLI surface changes
- .env additions / removals
```

## Push policy

Branch is assumed to be already pushed. Don't `git push` unless explicitly asked.

## Who merges

- **Code in `agent_factory/`, tests, docs/** — any tech-team member after standard review (≥1 approval, CI green).
- **Agentic foundation** (`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.cursor/skills/`, `prompts/`, `profiles/`) — core-team sign-off required; then anyone merges.
- **Agents** never merge their own PRs and do not open PRs unless explicitly told. Open the PR when told to, then stop.
