---
name: commit-message-standards
description: Generate Conventional Commits messages for agentic-coder.
---

# commit-message-standards — agentic-coder

Conventional Commits, ≤72 chars per line, imperative summary.

```
<type>(<scope>): <imperative summary>

<body — explain WHY, wrap at 72>

<footer — Refs: #N>
```

Recommended `<scope>`:
- `agent` — `agent.py`, system prompt, loop changes.
- `tools` — `tools.py`, tool definitions, `execute_tool`.
- `adapter` — anything in `adapters/`.
- `scanner` — `scanner.py`.
- `cli` — `main.py`, `run.sh`, argparse.
- `docs` — README, AGENTS.md, CLAUDE.md, docs/.
- `ci`, `chore`, `deps`.

Examples:

```
feat(adapter): add linear task source

Mirrors the Jira adapter shape. Reads LINEAR_API_KEY and
LINEAR_TEAM_ID from .env. On task complete, posts a comment with
the PR URL via the Linear GraphQL API.
```

```
fix(scanner): wire exclude_glob for console.log rule

The SCAN_CATEGORIES dict defined `exclude_glob` for the
`console.log` rule but `_search` ignored it, so test files were
counted as production violations. Pass it to rg via --glob '!…'.
```

Anti-patterns: `wip`, `update`, `cleanup`, multi-purpose commits.
