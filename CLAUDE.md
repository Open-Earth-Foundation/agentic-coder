# Claude Code — Context for `agentic-coder`

This file supplements `AGENTS.md` with the conventions Claude Code (and similar) need to work in this repo. Read `AGENTS.md` first.

## What this codebase is

A small Python CLI that drives an autonomous coder loop using `anthropic.Anthropic.messages.create` with `tools` for an LLM tool-use workflow. The agent runs against a **target** repository configured via `REPO_PATH` in `.env`.

## Where the loop lives

- `agent_factory/agent.py:run_agent()` — the main loop. ~50 turns max. Returns when the model returns `end_turn` with no tool calls (or when `max_agent_turns` is hit).
- `agent_factory/agent.py:SYSTEM_PROMPT` — the system prompt template; `branch_prefix` and `base_branch` are formatted in. The prompt is also augmented with `gather_project_context()` from the target repo.
- `agent_factory/tools.py:TOOL_DEFINITIONS` + `execute_tool()` — 5 tools: `read_file`, `search_code`, `list_directory`, `edit_file`, `run_command`. `run_command` strips `GITHUB_TOKEN` from the env passed to subprocess.
- `agent_factory/context.py:gather_project_context()` — reads `README.md`, `.cursor/rules/**/*.{md,mdc}`, `.cursor/skills/**/SKILL.md`, `AGENTS.md`, `CONTRIBUTING.md` from the target repo, capped at 12k chars.

## Where the adapters live

- `agent_factory/adapters/{markdown,jira,notion}.py` — each implements `TaskAdapter` (`fetch_tasks`, `on_task_started`, `on_task_completed`).

## Important defaults / pitfalls

- **Cost rates** are hardcoded for Sonnet ($3/M input, $15/M output) in `agent.py:COST_PER_MTok`. If the model changes, these are wrong.
- **PR URL extraction** uses a single regex (`https://github\\.com/[^\\s)]+/pull/\\d+`). It only catches GitHub URLs.
- **`gh` is invoked by the model**, not by Python. Preflight checks `gh auth status` but doesn't validate the model uses `gh` correctly.
- **Logs** go to `agentic-coder/logs/` (not the target repo's logs/).
- **`task.repo`** is parsed from markdown but never used. (Open ticket in `docs/agent-runbook.md`.)
- **Scanner `console.log` rule** has an `exclude_glob` field that is **not wired** in `scanner.py:_search`.
- **`config.validate()`** only checks `ANTHROPIC_API_KEY`; `REPO_PATH` validation lives in `main.py`.
- **Heredoc PR creation** is done by the model — see the `git workflow` section of `SYSTEM_PROMPT`.

## Conventions

- Conventional Commits (`feat(scope): …`).
- Branch off `main`. PR opens with title prefix `feat(...)` / `fix(...)` etc.
- Imports: stdlib → third-party → local.
- Type hints on public functions.
- `pathlib.Path` for filesystem.
- `logging` if you add logging (currently mostly `print` to terminal).

## Gotchas when extending

- **Adding a new tool**: also update `_summarize_tool_output()` if its output is too large. The agent panics on multi-MB tool returns.
- **Adding a new adapter**: register it in `_build_adapter()` (`main.py`) and the argparse subparser. The adapter's `__init__` should accept a `Config` so we don't drift on env loading.
- **Changing `max_tokens`** (16384 default in `client.messages.create`): be aware of cost. Defaults exist for a reason.
- **Multi-repo**: not implemented. The roadmap calls for `profiles/<repo>.yaml`. If you start that work, see `profiles/citycatalyst.yaml` for the shape.

## Running locally

```bash
python -m agent_factory markdown tasks/getting-started.md --task 1
python -m agent_factory scan
python -m agent_factory watch jira
```

`run.sh` wraps these with sensible defaults (`TASKS_FILE`, `.venv` activation).
