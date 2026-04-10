"""Base adapter interface for task sources."""

from __future__ import annotations

from abc import ABC, abstractmethod

from ..task_parser import Task


class TaskAdapter(ABC):
    """Fetches tasks from an external source and converts them to Task objects."""

    @abstractmethod
    def fetch_tasks(self) -> list[Task]:
        """Return a list of tasks ready for the agent to process."""
        ...

    @abstractmethod
    def on_task_started(self, task: Task) -> None:
        """Called when the agent starts working on a task."""
        ...

    @abstractmethod
    def on_task_completed(self, task: Task, summary: str, pr_url: str | None) -> None:
        """Called when the agent finishes a task. pr_url may be None if PR creation failed."""
        ...
