# agentic-coder — Extending

How to add adapters, tools, scanner rules, and per-repo profiles.

---

## Add a task adapter (e.g. Linear, GitHub Issues)

1. Create `agent_factory/adapters/<source>.py` subclassing `TaskAdapter`:

   ```python
   from agent_factory.adapters.base import TaskAdapter
   from agent_factory.task_parser import Task

   class LinearAdapter(TaskAdapter):
       def __init__(self, config):
           self.api_key = os.environ["LINEAR_API_KEY"]
           self.team_id = os.environ["LINEAR_TEAM_ID"]
           if not self.api_key:
               raise RuntimeError("LINEAR_API_KEY missing")

       def fetch_tasks(self) -> list[Task]: ...
       def on_task_started(self, task: Task) -> None: ...
       def on_task_completed(self, task: Task, result) -> None: ...
   ```

2. Register in `main.py:_build_adapter()`:

   ```python
   if args.command == "linear":
       return LinearAdapter(config)
   ```

3. Add a subparser in `main.py:_build_argparser()`:

   ```python
   sub.add_parser("linear", help="Pull tasks from Linear")
   ```

4. Update `.env.example`:

   ```
   # Linear (optional — needed for ./run.sh linear)
   # LINEAR_API_KEY=lin_api_...
   # LINEAR_TEAM_ID=...
   ```

5. Add a smoke test in `tests/adapters/test_linear.py` (we don't have a tests/ folder yet — start with `pytest` and a single test).

6. Document in `README.md` and `docs/PLAYBOOK.md`.

7. Commit + PR (`feat(adapter): add linear task source`).

---

## Add a tool

1. Add an entry in `tools.py:TOOL_DEFINITIONS` with `name`, `description` (LLM-facing), and `input_schema`.

2. Add a branch in `execute_tool()`:

   ```python
   if name == "git_diff":
       result = subprocess.run(["git", "--no-pager", "diff", "HEAD"], ...)
       return _truncate(result.stdout, 10_000)
   ```

3. **Respect `Config.dry_run`** if the tool mutates state.

4. Cap output (`_truncate(..., 10_000)`).

5. Add to `system prompt` in `agent.py` if the tool is non-obvious to the model.

6. Smoke test (`tests/test_tools.py`).

7. Commit + PR (`feat(tools): add git_diff tool`).

---

## Add a scanner rule

In `scanner.py:SCAN_CATEGORIES`:

```python
{
    "name": "missing_abort_signal",
    "pattern": r"\\bfetch\\(",                         # naive — refine with rg --pcre2
    "glob": "*.{ts,tsx}",
    "exclude_glob": "**/test/**",                     # honour this in _search!
    "task_type": "improvement",
    "description_template": (
        "Found {count} fetch() calls without an AbortSignal across "
        "{file_count} files. Add timeout + signal per the "
        "tighten-fetch-resilience skill."
    ),
}
```

**Important**: there's a known bug — `_search` doesn't currently honour `exclude_glob` for the `console.log` rule. Wire it in the same PR if you add a rule that needs exclusions.

Commit + PR (`feat(scanner): add missing_abort_signal rule`).

---

## Add a per-repo profile

1. Create `profiles/<repo>.yaml` (see `profiles/citycatalyst.yaml` for the shape).

2. Until the CLI loader is implemented, document the values to copy into `.env` in the README of the target repo.

3. Wiring it into the CLI is a future feature — track in `tasks/self-improvement.md`.

---

## Add a system-prompt change

1. Update `prompts/system-base.md` with the new instructions.

2. Translate into the Python triple-string in `agent_factory/agent.py:SYSTEM_PROMPT`.

3. Run a smoke task (`./run.sh task 1` against a small target) and verify the agent still ships.

4. Commit + PR (`feat(agent): instruct model to ...`).

---

## Lift the model / rates

If you switch the default model (`Config.model`):

1. Update `agent_factory/agent.py:COST_PER_MTok` to the new rates (input + output per million tokens).

2. Update `.env.example` if model selection is now env-driven.

3. Update `README.md` mention of "Sonnet".

4. Commit + PR (`chore(agent): switch default model to ...`).

---

## Tests

We don't have a `tests/` folder yet. The first test we add should be a smoke for `gather_project_context()` (it exercises file IO + globbing). Do that as part of the next adapter / tool addition.
