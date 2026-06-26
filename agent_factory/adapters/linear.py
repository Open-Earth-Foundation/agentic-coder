"""Linear adapter — fetches tasks from Linear filtered by label."""

from __future__ import annotations

import json
import os
import urllib.request
import urllib.error

from ..task_parser import Task
from .base import TaskAdapter

GRAPHQL_URL = "https://api.linear.app/graphql"


class LinearAdapter(TaskAdapter):
    def __init__(
        self,
        api_key: str | None = None,
        team_id: str | None = None,
        label: str = "agent-ready",
    ):
        self.api_key = api_key or os.environ.get("LINEAR_API_KEY", "")
        self.team_id = team_id or os.environ.get("LINEAR_TEAM_ID", "")
        self.label = label or os.environ.get("LINEAR_AGENT_LABEL", "agent-ready")

        if not self.api_key:
            raise ValueError(
                "Linear adapter requires LINEAR_API_KEY. "
                "Set it in .env or pass directly."
            )

    def _graphql(self, query: str, variables: dict | None = None) -> dict:
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        body = json.dumps(payload).encode()
        req = urllib.request.Request(
            GRAPHQL_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": self.api_key,
                "Content-Type": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read())

        if result.get("errors"):
            raise RuntimeError(f"Linear GraphQL error: {result['errors']}")
        return result.get("data", {})

    def fetch_tasks(self) -> list[Task]:
        query = """
        query FetchAgentTasks($teamId: String, $label: String!) {
          issues(
            filter: {
              team: { id: { eq: $teamId } }
              labels: { name: { eq: $label } }
              state: { type: { nin: ["completed", "canceled"] } }
            }
            orderBy: priority
            first: 20
          ) {
            nodes {
              id
              identifier
              title
              description
              priority
              state { name type }
              labels { nodes { name } }
            }
          }
        }
        """
        variables = {"label": self.label}
        if self.team_id:
            variables["teamId"] = self.team_id

        data = self._graphql(query, variables)
        nodes = data.get("issues", {}).get("nodes", [])

        tasks = []
        for issue in nodes:
            description = issue.get("description") or ""

            task = Task(
                title=f'{issue["identifier"]}: {issue["title"]}',
                task_type=self._infer_type(issue),
                description=description,
                files=self._extract_files_from_description(description),
            )
            task._linear_issue_id = issue["id"]
            task._linear_identifier = issue["identifier"]
            tasks.append(task)

        return tasks

    def on_task_started(self, task: Task) -> None:
        issue_id = getattr(task, "_linear_issue_id", None)
        if not issue_id:
            return
        try:
            self._transition_issue(issue_id, "In Progress")
        except Exception:
            pass

    def on_task_completed(self, task: Task, summary: str, pr_url: str | None) -> None:
        issue_id = getattr(task, "_linear_issue_id", None)
        if not issue_id:
            return
        try:
            comment_body = "**Agent completed this task.**\n\n"
            if pr_url:
                comment_body += f"PR: {pr_url}\n\n"
            comment_body += f"**Summary:**\n{summary[:2000]}"

            self._add_comment(issue_id, comment_body)
            self._transition_issue(issue_id, "In Review")
        except Exception:
            pass

    def _transition_issue(self, issue_id: str, state_name: str) -> None:
        state_id = self._resolve_state_id(state_name)
        if not state_id:
            return

        mutation = """
        mutation UpdateIssueState($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
          }
        }
        """
        self._graphql(mutation, {"id": issue_id, "stateId": state_id})

    def _resolve_state_id(self, state_name: str) -> str | None:
        if not self.team_id:
            return None

        query = """
        query GetStates($teamId: String!) {
          workflowStates(filter: { team: { id: { eq: $teamId } } }) {
            nodes { id name }
          }
        }
        """
        data = self._graphql(query, {"teamId": self.team_id})
        nodes = data.get("workflowStates", {}).get("nodes", [])

        for state in nodes:
            if state["name"].lower() == state_name.lower():
                return state["id"]
        return None

    def _add_comment(self, issue_id: str, body: str) -> None:
        mutation = """
        mutation AddComment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success
          }
        }
        """
        self._graphql(mutation, {"issueId": issue_id, "body": body})

    @staticmethod
    def _infer_type(issue: dict) -> str:
        labels = [l["name"].lower() for l in issue.get("labels", {}).get("nodes", [])]
        if any(l in ("bug", "bugfix") for l in labels):
            return "bugfix"
        if "feature" in labels:
            return "feature"
        if "refactor" in labels:
            return "improvement"
        return "improvement"

    @staticmethod
    def _extract_files_from_description(text: str) -> list[str]:
        import re
        return re.findall(r'[\w/.-]+\.\w{1,5}', text)[:10]
