"""Agentic loop: Claude with tool use to implement a single task."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
from rich.console import Console
from rich.markdown import Markdown
from rich.panel import Panel

from .config import Config
from .context import gather_project_context
from .task_parser import Task
from .tools import TOOL_DEFINITIONS, execute_tool

console = Console()

COST_PER_MTok = {
    "input": 3.0,
    "output": 15.0,
}


class UsageTracker:
    """Tracks token usage and estimated cost across API calls."""

    def __init__(self) -> None:
        self.input_tokens = 0
        self.output_tokens = 0
        self.api_calls = 0

    def record(self, response: Any) -> None:
        self.api_calls += 1
        usage = getattr(response, "usage", None)
        if usage:
            self.input_tokens += getattr(usage, "input_tokens", 0)
            self.output_tokens += getattr(usage, "output_tokens", 0)

    @property
    def estimated_cost_usd(self) -> float:
        return (
            (self.input_tokens / 1_000_000) * COST_PER_MTok["input"]
            + (self.output_tokens / 1_000_000) * COST_PER_MTok["output"]
        )

    def summary(self) -> str:
        return (
            f"API calls: {self.api_calls} | "
            f"Tokens: {self.input_tokens:,} in / {self.output_tokens:,} out | "
            f"Est. cost: ${self.estimated_cost_usd:.4f}"
        )


SYSTEM_PROMPT = """\
You are an autonomous software engineering agent. You receive a task and \
implement it in a codebase by reading, searching, editing files, writing tests, \
and validating your work.

## Workflow

1. **Understand** — Read the task carefully. If files are specified, start there. \
Otherwise, explore the repo structure to find relevant code. Check for existing \
tests, linting config, and coding patterns.
2. **Plan** — Describe your approach in a short plan (2-5 bullet points). \
Say it out loud as a text message.
3. **Implement** — Make the minimal, correct changes needed. Follow existing \
code style and conventions. Do NOT add unnecessary comments.
4. **Test** — After implementing:
   - Look for existing test files near the code you changed (e.g. `*.test.ts`, \
`*.jest.ts`, `*.spec.ts`, `*_test.py`, `test_*.py`).
   - If related tests exist, RUN them to make sure your changes don't break anything.
   - If the task is a bugfix or a new feature and the codebase has a test framework \
set up, WRITE a test that verifies your change works. Place it next to existing tests \
following the same naming convention.
   - If no test framework is set up, or testing doesn't make sense for this change \
(e.g. YAML config, docs, removing console.log), skip this step and explain why.
5. **Validate** — After editing:
   - Re-read the changed files to verify correctness.
   - Run the project's linter if available (e.g. `npm run lint`, `flake8`, etc.).
   - Run the project's type checker if available (e.g. `npx tsc --noEmit`, `mypy`).
   - If lint or type errors are found IN YOUR CHANGES, fix them. Ignore pre-existing warnings.
6. **Self-review** — Before committing, review your own diff: `git diff`. \
Check for: accidental debug code, leftover console.log, unnecessary changes, \
missing edge cases.
7. **Git** — Create a branch, stage changes, commit, push, and create a PR.

## Rules

- Make the SMALLEST change that solves the task correctly.
- Do NOT modify files unrelated to the task.
- Do NOT add comments that narrate what the code does.
- If you're unsure about something, read more code before guessing.
- Commit messages should explain WHY, not WHAT.
- Always check that your edits compile / don't break syntax.
- NEVER use git push --force or git push -f.
- If tests fail after your changes, FIX the issue and re-run. Iterate up to 3 times.
- If you wrote tests, include them in the same commit as the implementation.

## Git conventions

- Branch name: {branch_prefix}/{branch_name}
- Base branch: {base_branch}
- Commit style: conventional commits (fix:, feat:, chore:, etc.)

## Git workflow (follow this EXACTLY after implementing and testing)

1. Make sure you are on {base_branch} first: `git checkout {base_branch}`
2. Create a branch: `git checkout -b {branch_prefix}/branch-name`
3. Stage and commit your changes (implementation + tests in one commit)
4. Push the branch: `git push -u origin HEAD`
5. Create the PR using gh CLI with a HEREDOC for the body:

```
gh pr create --base {base_branch} --title "the title" --body "$(cat <<'EOF'
## Summary
<bullet points>

## Changes
<what was changed and why>

## Test plan
- [ ] test steps

## Tests added
<describe any tests you wrote, or "N/A" if not applicable>
EOF
)"
```

6. In your final text message, include the PR URL that `gh pr create` outputs.
"""


def build_task_prompt(task: Task) -> str:
    parts = [f"# Task: {task.title}\n"]
    if task.description:
        parts.append(f"**Description:** {task.description}\n")
    if task.task_type:
        parts.append(f"**Type:** {task.task_type}\n")
    if task.files:
        parts.append(f"**Relevant files:** {', '.join(task.files)}\n")
    if task.acceptance_criteria:
        parts.append("**Acceptance criteria:**")
        for c in task.acceptance_criteria:
            parts.append(f"- {c}")
        parts.append("")
    if task.raw and task.raw not in "\n".join(parts):
        parts.append(f"\n**Full task context:**\n{task.raw}")
    return "\n".join(parts)


def _extract_pr_url(text: str) -> str | None:
    """Extract a GitHub PR URL from the agent's output."""
    match = re.search(r'https://github\.com/[^\s)]+/pull/\d+', text)
    return match.group(0) if match else None


def run_agent(task: Task, config: Config, repo_root: str) -> tuple[str, str | None]:
    """Execute the agentic loop for a single task.

    Returns (summary_text, pr_url_or_none).
    """
    client = anthropic.Anthropic(api_key=config.anthropic_api_key)
    tracker = UsageTracker()

    system = SYSTEM_PROMPT.format(
        branch_prefix=config.branch_prefix,
        branch_name=task.branch_name,
        base_branch=config.base_branch,
    )

    project_context = gather_project_context(repo_root)
    if project_context:
        system += f"\n\n{project_context}"

    messages: list[dict[str, Any]] = [
        {"role": "user", "content": build_task_prompt(task)},
    ]

    console.print(Panel(f"[bold]Task:[/bold] {task.title}", style="cyan"))
    if project_context:
        ctx_len = len(project_context)
        console.print(f"[dim]Injected {ctx_len:,} chars of project context (rules, skills, README)[/dim]")

    all_text: list[str] = []

    for turn in range(config.max_agent_turns):
        console.print(f"\n[dim]--- Turn {turn + 1}/{config.max_agent_turns} ---[/dim]")

        response = client.messages.create(
            model=config.model,
            max_tokens=16384,
            system=system,
            tools=TOOL_DEFINITIONS,
            messages=messages,
        )
        tracker.record(response)

        assistant_content = response.content
        messages.append({"role": "assistant", "content": assistant_content})

        tool_calls = [b for b in assistant_content if b.type == "tool_use"]
        text_blocks = [b for b in assistant_content if b.type == "text"]

        for tb in text_blocks:
            console.print(Markdown(tb.text))
            all_text.append(tb.text)

        if response.stop_reason == "end_turn" and not tool_calls:
            final_text = "\n".join(all_text)
            pr_url = _extract_pr_url(final_text)
            console.print(Panel(
                f"[bold green]Task completed[/bold green]\n[dim]{tracker.summary()}[/dim]",
                style="green",
            ))
            _save_session_log(task, final_text, pr_url, config, tracker)
            return final_text, pr_url

        if not tool_calls:
            console.print("[yellow]No tool calls and no end_turn — stopping.[/yellow]")
            final_text = "\n".join(all_text)
            pr_url = _extract_pr_url(final_text)
            console.print(f"[dim]{tracker.summary()}[/dim]")
            _save_session_log(task, final_text, pr_url, config, tracker)
            return final_text, pr_url

        tool_results = []
        for tc in tool_calls:
            tool_name = tc.name
            tool_input = tc.input if isinstance(tc.input, dict) else json.loads(tc.input)

            console.print(f"  [blue]Tool:[/blue] {tool_name}({_summarize_args(tool_input)})")

            if config.dry_run and tool_name in ("edit_file", "run_command"):
                result_text = f"[DRY RUN] Would execute {tool_name} — skipped."
            else:
                result_text = execute_tool(tool_name, tool_input, repo_root)

            preview = result_text[:200] + ("..." if len(result_text) > 200 else "")
            console.print(f"  [dim]→ {preview}[/dim]")

            tool_results.append(
                {
                    "type": "tool_result",
                    "tool_use_id": tc.id,
                    "content": result_text,
                }
            )

        messages.append({"role": "user", "content": tool_results})

    console.print("[red]Agent reached max turns without completing.[/red]")
    console.print(f"[dim]{tracker.summary()}[/dim]")
    final_text = "\n".join(all_text)
    _save_session_log(task, final_text, None, config, tracker)
    return final_text, None


def _save_session_log(task: Task, summary: str, pr_url: str | None, config: Config, tracker: UsageTracker | None = None) -> None:
    """Save a log of the completed task to the logs directory."""
    log_dir = Path(__file__).parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    slug = task.branch_name[:40]
    log_path = log_dir / f"{timestamp}-{slug}.md"

    content = f"# {task.title}\n\n"
    content += f"**Date:** {timestamp}\n"
    content += f"**Type:** {task.task_type}\n"
    content += f"**Branch:** {config.branch_prefix}/{task.branch_name}\n"
    if pr_url:
        content += f"**PR:** {pr_url}\n"
    if tracker:
        content += f"**Cost:** {tracker.summary()}\n"
    content += f"\n---\n\n{summary}\n"

    log_path.write_text(content)
    console.print(f"[dim]Session log saved: {log_path}[/dim]")


def _summarize_args(args: dict) -> str:
    parts = []
    for k, v in args.items():
        s = str(v)
        if len(s) > 60:
            s = s[:57] + "..."
        parts.append(f"{k}={s!r}")
    return ", ".join(parts)
