# agentic-coder — Self-Improvement Tasks

These tasks improve the **tool itself** (`agentic-coder`). Run with:

```bash
REPO_PATH=. BASE_BRANCH=main BRANCH_PREFIX=agent ./run.sh task <N>
```

Order is "easiest → hardest." Pick the top unchecked one.

## Wire scanner exclude_glob for console.log rule

- **type**: bugfix
- **description**: `agent_factory/scanner.py:SCAN_CATEGORIES["console.log"]` defines `exclude_glob` (test directories) but `_search` does not pass it to `rg`. As a result, the scanner counts test files as production violations. Wire `exclude_glob` through `_search` so it adds `--glob '!<pattern>'` (or `-g '!<pattern>'` for ripgrep) to the underlying call.
- **files**: agent_factory/scanner.py

### Acceptance criteria

- `_search` accepts and applies the optional `exclude_glob` from the category dict.
- Default behaviour for categories without `exclude_glob` is unchanged.
- A unit test (or smoke test) demonstrates that test files are excluded from the `console.log` count.

## Make COST_PER_MTok model-aware

- **type**: improvement
- **description**: `agent_factory/agent.py:COST_PER_MTok` is hardcoded for Sonnet ($3/M input, $15/M output). When the configured model changes (e.g. Opus, Haiku), the cost line is wrong. Replace the constant with a small lookup keyed by model id, with a sensible default + a warning log when the model isn't in the lookup.
- **files**: agent_factory/agent.py

### Acceptance criteria

- `UsageTracker` consults a `COST_RATES` mapping keyed by `Config.model`.
- Unknown models log a one-line warning and fall back to a documented default.
- A unit test asserts cost computation for at least 2 known models.

## Use task.repo if present (multi-repo support — minimal)

- **type**: feature
- **description**: `Task.repo` is parsed from markdown but never used. As a first step toward multi-repo support, when `task.repo` is set and is a path that exists, override `Config.repo_path` for that task. Don't change other tasks. Log the override clearly.
- **files**: agent_factory/main.py, agent_factory/task_parser.py (only if needed)

### Acceptance criteria

- When a markdown task has `**repo**: ../some-other-repo`, the agent runs against that path.
- Tasks without `**repo**` use `Config.repo_path` as before.
- Logging makes the override visible.

## Per-task daily cost cap (soft enforcement)

- **type**: feature
- **description**: Add a per-day USD budget, defaulting to a high value (e.g. $20/day). Sum cost across `logs/*.md` for today's date and refuse to start a new task if the cap is reached. Surface a clear message and exit non-zero. Configurable via env (`DAILY_COST_USD_CAP`).
- **files**: agent_factory/agent.py, agent_factory/config.py, agent_factory/main.py

### Acceptance criteria

- New `Config.daily_cost_usd_cap` (default 20.0).
- Before each task, `main.py` reads today's logs, sums cost, refuses if over cap.
- Verbose log line shows current spend / cap before each task starts.

## Honour profiles/<repo>.yaml

- **type**: feature
- **description**: Implement `--profile <name>` flag that loads `profiles/<name>.yaml` and uses its values as defaults (env overrides take precedence). Touches `Config` and `main.py`. Don't change CLI surface for non-`--profile` usage.
- **files**: agent_factory/config.py, agent_factory/main.py, requirements.txt (add pyyaml)

### Acceptance criteria

- `./run.sh ... --profile citycatalyst ...` loads `profiles/citycatalyst.yaml`.
- Values become defaults; explicit env / CLI overrides win.
- README + PLAYBOOK updated.
- Smoke test exercises a profile load.

## First test (smoke for gather_project_context)

- **type**: improvement
- **description**: We have no `tests/` folder. Create `tests/test_context.py` with a smoke for `gather_project_context()`: point it at this repo's own `.cursor/`, assert the returned string contains expected substrings (`AGENTS.md`, `general.mdc`).
- **files**: tests/test_context.py, requirements.txt (add pytest)

### Acceptance criteria

- `pytest tests/test_context.py` passes locally.
- README mentions `pytest` for tests.
