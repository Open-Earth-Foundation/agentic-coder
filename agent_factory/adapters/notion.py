"""Notion adapter — fetches tasks from a Notion database."""

from __future__ import annotations

import json
import os
import urllib.request
import urllib.error

from ..task_parser import Task
from .base import TaskAdapter


class NotionAdapter(TaskAdapter):
    def __init__(
        self,
        api_key: str | None = None,
        database_id: str | None = None,
        status_property: str = "Status",
        ready_status: str = "Agent Ready",
    ):
        self.api_key = api_key or os.environ.get("NOTION_API_KEY", "")
        self.database_id = database_id or os.environ.get("NOTION_DATABASE_ID", "")
        self.status_property = status_property
        self.ready_status = ready_status

        if not all([self.api_key, self.database_id]):
            raise ValueError(
                "Notion adapter requires NOTION_API_KEY and NOTION_DATABASE_ID. "
                "Set them in .env or pass directly."
            )

    def _api_post(self, path: str, data: dict) -> dict:
        url = f"https://api.notion.com/v1/{path}"
        body = json.dumps(data).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def _api_patch(self, path: str, data: dict) -> dict:
        url = f"https://api.notion.com/v1/{path}"
        body = json.dumps(data).encode()
        req = urllib.request.Request(url, data=body, method="PATCH", headers={
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def _get_blocks(self, page_id: str) -> str:
        url = f"https://api.notion.com/v1/blocks/{page_id}/children?page_size=100"
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {self.api_key}",
            "Notion-Version": "2022-06-28",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())

        texts = []
        for block in data.get("results", []):
            block_type = block.get("type", "")
            content = block.get(block_type, {})
            rich_texts = content.get("rich_text", []) if isinstance(content, dict) else []
            for rt in rich_texts:
                texts.append(rt.get("plain_text", ""))
        return "\n".join(texts)

    def fetch_tasks(self) -> list[Task]:
        result = self._api_post(f"databases/{self.database_id}/query", {
            "filter": {
                "property": self.status_property,
                "status": {"equals": self.ready_status},
            },
            "page_size": 20,
        })

        tasks = []
        for page in result.get("results", []):
            props = page.get("properties", {})

            title = ""
            title_prop = props.get("Name") or props.get("Title") or props.get("title")
            if title_prop and title_prop.get("title"):
                title = "".join(t.get("plain_text", "") for t in title_prop["title"])

            if not title:
                continue

            task_type = "improvement"
            type_prop = props.get("Type") or props.get("type")
            if type_prop:
                sel = type_prop.get("select") or type_prop.get("status")
                if sel:
                    task_type = sel.get("name", "improvement").lower()

            files_prop = props.get("Files") or props.get("files")
            files = []
            if files_prop and files_prop.get("rich_text"):
                files_text = "".join(t.get("plain_text", "") for t in files_prop["rich_text"])
                files = [f.strip() for f in files_text.split(",") if f.strip()]

            description = self._get_blocks(page["id"])

            task = Task(
                title=title,
                task_type=task_type,
                description=description,
                files=files,
            )
            task._notion_page_id = page["id"]
            tasks.append(task)

        return tasks

    def on_task_started(self, task: Task) -> None:
        page_id = getattr(task, "_notion_page_id", None)
        if not page_id:
            return
        try:
            self._api_patch(f"pages/{page_id}", {
                "properties": {
                    self.status_property: {"status": {"name": "In Progress"}},
                },
            })
        except Exception:
            pass

    def on_task_completed(self, task: Task, summary: str, pr_url: str | None) -> None:
        page_id = getattr(task, "_notion_page_id", None)
        if not page_id:
            return
        try:
            self._api_patch(f"pages/{page_id}", {
                "properties": {
                    self.status_property: {"status": {"name": "Done"}},
                },
            })
            comment = f"Agent completed this task."
            if pr_url:
                comment += f"\nPR: {pr_url}"

            self._api_post("comments", {
                "parent": {"page_id": page_id},
                "rich_text": [{"type": "text", "text": {"content": comment[:2000]}}],
            })
        except Exception:
            pass
