"""Evaluator step: a second Claude call to review the agent's diff."""

from __future__ import annotations

import anthropic
from rich.console import Console

from .config import Config
from .task_parser import Task

console = Console()

EVALUATOR_SYSTEM_PROMPT = """\
You are a senior code reviewer evaluating a diff produced by an AI coding agent.

The agent was given a task and produced the diff below. Your job is to decide \
whether the change is ready to merge.

## Criteria

1. **Minimal** — Only changes what the task requires, no unrelated modifications.
2. **Correct** — The logic is right. No obvious bugs, off-by-one errors, or \
missing edge cases.
3. **Tested** — If the codebase has a test framework, tests were added or \
existing tests still pass.
4. **Safe** — No secrets, no destructive operations, no security regressions.
5. **Style** — Follows the existing code style. No unnecessary comments.

## Response format

Respond with EXACTLY one of these on the first line:

PASS
FAIL

Then on subsequent lines, provide brief feedback (2-5 bullet points). If PASS, \
note what looks good. If FAIL, explain what must be fixed.
"""


def evaluate_changes(
    diff: str, task: Task, config: Config
) -> tuple[bool, str]:
    """Run a fresh Claude call to review the agent's diff.

    Returns (passed, feedback).
    """
    client = anthropic.Anthropic(api_key=config.anthropic_api_key)

    user_message = (
        f"## Task\n{task.title}\n\n"
        f"## Description\n{task.description or '(none)'}\n\n"
        f"## Diff\n```diff\n{diff}\n```"
    )

    console.print("[dim]Running evaluator pass…[/dim]")

    response = client.messages.create(
        model=config.model,
        max_tokens=2048,
        system=EVALUATOR_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    text = ""
    for block in response.content:
        if block.type == "text":
            text += block.text

    text = text.strip()
    first_line = text.split("\n", 1)[0].strip().upper()
    passed = first_line == "PASS"
    feedback = text.split("\n", 1)[1].strip() if "\n" in text else text

    status = "[green]PASS[/green]" if passed else "[red]FAIL[/red]"
    console.print(f"  Evaluator: {status}")
    console.print(f"  [dim]{feedback[:300]}[/dim]")

    return passed, feedback
