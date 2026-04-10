"""Jira adapter — fetches tasks from a Jira board filtered by label."""

from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from base64 import b64encode

from ..task_parser import Task
from .base import TaskAdapter


class JiraAdapter(TaskAdapter):
    def __init__(
        self,
        domain: str | None = None,
        email: str | None = None,
        api_token: str | None = None,
        project: str | None = None,
        label: str = "agent-ready",
    ):
        self.domain = domain or os.environ.get("JIRA_DOMAIN", "")
        self.email = email or os.environ.get("JIRA_EMAIL", "")
        self.api_token = api_token or os.environ.get("JIRA_API_TOKEN", "")
        self.project = project or os.environ.get("JIRA_PROJECT", "")
        self.label = label or os.environ.get("JIRA_AGENT_LABEL", "agent-ready")

        if not all([self.domain, self.email, self.api_token]):
            raise ValueError(
                "Jira adapter requires JIRA_DOMAIN, JIRA_EMAIL, and JIRA_API_TOKEN. "
                "Set them in .env or pass directly."
            )

    @property
    def _auth_header(self) -> str:
        creds = b64encode(f"{self.email}:{self.api_token}".encode()).decode()
        return f"Basic {creds}"

    def _api_get(self, path: str) -> dict:
        url = f"https://{self.domain}/rest/api/3/{path}"
        req = urllib.request.Request(url, headers={
            "Authorization": self._auth_header,
            "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def _api_put(self, path: str, data: dict) -> None:
        url = f"https://{self.domain}/rest/api/3/{path}"
        body = json.dumps(data).encode()
        req = urllib.request.Request(url, data=body, method="PUT", headers={
            "Authorization": self._auth_header,
            "Content-Type": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30):
            pass

    def _api_post(self, path: str, data: dict) -> dict:
        url = f"https://{self.domain}/rest/api/3/{path}"
        body = json.dumps(data).encode()
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Authorization": self._auth_header,
            "Content-Type": "application/json",
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())

    def fetch_tasks(self) -> list[Task]:
        project_clause = f"project = {self.project} AND " if self.project else ""
        jql = f'{project_clause}labels = "{self.label}" AND status != Done ORDER BY priority DESC'
        result = self._api_get(f"search?jql={urllib.request.quote(jql)}&maxResults=20")

        tasks = []
        for issue in result.get("issues", []):
            fields = issue["fields"]
            description_text = ""
            if fields.get("description"):
                description_text = self._extract_text_from_adf(fields["description"])

            task = Task(
                title=f'{issue["key"]}: {fields["summary"]}',
                task_type=self._map_issue_type(fields.get("issuetype", {}).get("name", "")),
                description=description_text,
                files=self._extract_files_from_description(description_text),
            )
            task._jira_key = issue["key"]
            tasks.append(task)

        return tasks

    def on_task_started(self, task: Task) -> None:
        key = getattr(task, "_jira_key", None)
        if not key:
            return
        try:
            transitions = self._api_get(f"issue/{key}/transitions")
            in_progress = next(
                (t for t in transitions.get("transitions", [])
                 if t["name"].lower() in ("in progress", "in development")),
                None,
            )
            if in_progress:
                self._api_post(f"issue/{key}/transitions", {
                    "transition": {"id": in_progress["id"]},
                })
        except Exception:
            pass

    def on_task_completed(self, task: Task, summary: str, pr_url: str | None) -> None:
        key = getattr(task, "_jira_key", None)
        if not key:
            return
        try:
            comment_body = f"Agent completed this task.\n\n"
            if pr_url:
                comment_body += f"PR: {pr_url}\n\n"
            comment_body += f"Summary:\n{summary[:2000]}"

            self._api_post(f"issue/{key}/comment", {
                "body": {
                    "type": "doc",
                    "version": 1,
                    "content": [{
                        "type": "paragraph",
                        "content": [{"type": "text", "text": comment_body}],
                    }],
                },
            })
        except Exception:
            pass

    @staticmethod
    def _map_issue_type(issue_type: str) -> str:
        mapping = {"bug": "bugfix", "story": "feature", "task": "improvement", "sub-task": "improvement"}
        return mapping.get(issue_type.lower(), "improvement")

    @staticmethod
    def _extract_text_from_adf(adf: dict) -> str:
        """Extract plain text from Atlassian Document Format."""
        texts = []
        def walk(node: dict | list) -> None:
            if isinstance(node, list):
                for item in node:
                    walk(item)
                return
            if isinstance(node, dict):
                if node.get("type") == "text":
                    texts.append(node.get("text", ""))
                for child in node.get("content", []):
                    walk(child)
        walk(adf)
        return " ".join(texts).strip()

    @staticmethod
    def _extract_files_from_description(text: str) -> list[str]:
        """Try to find file paths mentioned in the description."""
        import re
        return re.findall(r'[\w/.-]+\.\w{1,5}', text)[:10]
