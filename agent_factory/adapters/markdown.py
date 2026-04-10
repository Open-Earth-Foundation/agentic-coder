"""Markdown file adapter — reads tasks from a .md file."""

from __future__ import annotations

from ..task_parser import Task, load_tasks
from .base import TaskAdapter


class MarkdownAdapter(TaskAdapter):
    def __init__(self, file_path: str):
        self.file_path = file_path

    def fetch_tasks(self) -> list[Task]:
        return load_tasks(self.file_path)

    def on_task_started(self, task: Task) -> None:
        pass

    def on_task_completed(self, task: Task, summary: str, pr_url: str | None) -> None:
        pass
