"""Parse a markdown file into structured tasks for the agent."""

from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class Task:
    title: str
    task_type: str = "improvement"
    description: str = ""
    repo: str = ""
    files: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)
    raw: str = ""

    @property
    def branch_name(self) -> str:
        slug = re.sub(r"[^a-z0-9]+", "-", self.title.lower()).strip("-")[:50]
        return slug


def parse_tasks(markdown: str) -> list[Task]:
    """Split markdown into H2 sections and extract metadata per task."""
    blocks = re.split(r"(?=^## )", markdown, flags=re.MULTILINE)
    tasks: list[Task] = []

    for block in blocks:
        block = block.strip()
        if not block.startswith("## "):
            continue

        title_match = re.match(r"^## (.+)$", block, re.MULTILINE)
        if not title_match:
            continue

        task = Task(title=title_match.group(1).strip(), raw=block)

        for key, field_name in [
            ("type", "task_type"),
            ("repo", "repo"),
            ("description", "description"),
        ]:
            match = re.search(
                rf"[-*]\s+\*\*{key}\*\*\s*:\s*(.+)",
                block,
                re.IGNORECASE,
            )
            if match:
                setattr(task, field_name, match.group(1).strip())

        files_match = re.search(
            r"[-*]\s+\*\*files?\*\*\s*:\s*(.+)", block, re.IGNORECASE
        )
        if files_match:
            task.files = [
                f.strip() for f in files_match.group(1).split(",") if f.strip()
            ]

        desc_match = re.search(
            r"[-*]\s+\*\*description\*\*\s*:\s*(.+)",
            block,
            re.IGNORECASE | re.DOTALL,
        )
        if desc_match:
            task.description = desc_match.group(1).strip()

        criteria_section = re.search(
            r"### acceptance criteria\s*\n((?:[-*]\s+.+\n?)+)",
            block,
            re.IGNORECASE,
        )
        if criteria_section:
            task.acceptance_criteria = [
                re.sub(r"^[-*]\s+", "", line).strip()
                for line in criteria_section.group(1).strip().splitlines()
                if line.strip()
            ]

        if not task.description:
            lines = block.splitlines()[1:]
            prose = []
            for line in lines:
                if line.startswith("- **") or line.startswith("* **"):
                    continue
                if line.startswith("### "):
                    break
                if line.strip():
                    prose.append(line.strip())
            if prose:
                task.description = " ".join(prose)

        tasks.append(task)

    return tasks


def load_tasks(path: str) -> list[Task]:
    with open(path) as f:
        return parse_tasks(f.read())
