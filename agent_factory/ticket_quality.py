"""AI Ticket Quality Pass — enriches a Linear ticket with structured AC, code refs, technical notes.

Triggered for new tickets (or tickets with `needs-refinement` label). Applies the logic of
the CityCatalyst `create-ticket` / `refine-ticket` skills programmatically:

1. Reads title + description
2. Classifies (Story / Task / Bug / Spike)
3. Identifies likely affected services/files (heuristic + grep, no codebase clone)
4. Drafts acceptance criteria
5. Writes structured description: Summary, User Story (if Story), AC, DoR, Technical Notes
6. Updates the Linear issue description

Usage:
    python -m agent_factory.ticket_quality --issue CC-375
    python -m agent_factory.ticket_quality --watch
"""

from __future__ import annotations

import json
import os
import time
import urllib.request

from .config import Config

GRAPHQL_URL = "https://api.linear.app/graphql"

SYSTEM_PROMPT = """You are an AI ticket quality agent for Open Earth Foundation.

Given a draft Linear ticket (title + description), you produce a sprint-ready version following this exact structure:

```
## Summary
2-3 sentence description of the work and its purpose.

## User Story
<!-- only if type=Story -->
As a [persona], I want [capability] so that [benefit].

## Context & Code References
- **Affected services:** list (e.g., app/frontend, global-api, hiap, climate-advisor)
- **Likely files:** if you can infer from the description, list file paths to check
- **Related patterns:** describe existing patterns to follow if applicable

## Acceptance Criteria
- [ ] Specific, testable criterion 1
- [ ] Specific, testable criterion 2
- [ ] Specific, testable criterion 3
(3-6 items)

## Definition of Ready
- [ ] Design/Figma link attached (if UI work)
- [ ] API contract defined (if backend)
- [ ] Dependencies identified
- [ ] AC reviewed by engineer
- [ ] Estimate assigned

## Technical Notes
- **Suggested approach:** brief description
- **Migration needed:** Yes/No
- **New API endpoint:** Yes/No
- **i18n keys needed:** Yes/No
- **Feature flag:** Yes/No

## Open Questions
- (only if you genuinely don't know something — leave empty otherwise)
```

Classification rules:
- Mentions "bug", "broken", "fix", "regression", "error" → Bug
- Mentions "investigate", "spike", "explore", "research", "evaluate" → Spike (replace AC with "Questions to Answer")
- Mentions "incident", "outage", "down", "production issue" → Incident
- User-facing capability → Story
- Internal/technical → Task

Be concise. Respond ONLY with JSON:
{
  "type": "Story|Task|Bug|Spike|Incident",
  "new_description": "<the full structured markdown>"
}
"""


def _graphql(api_key: str, query: str, variables: dict | None = None) -> dict:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=body,
        method="POST",
        headers={"Authorization": api_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
    if result.get("errors"):
        raise RuntimeError(f"Linear error: {result['errors']}")
    return result.get("data", {})


def fetch_issue(api_key: str, identifier: str) -> dict:
    query = f"""
    {{
      issue(id: "{identifier}") {{
        id identifier title description
        labels {{ nodes {{ name }} }}
      }}
    }}
    """
    return _graphql(api_key, query).get("issue", {})


def fetch_tickets_needing_refinement(api_key: str, team_id: str) -> list[dict]:
    query = f"""
    {{
      issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          labels: {{ name: {{ eq: "needs-refinement" }} }}
          state: {{ type: {{ nin: ["completed", "canceled"] }} }}
        }}
        first: 10
      ) {{
        nodes {{
          id identifier title description
          labels {{ nodes {{ name }} }}
        }}
      }}
    }}
    """
    return _graphql(api_key, query).get("issues", {}).get("nodes", [])


def refine(issue: dict, config: Config) -> tuple[str, str]:
    """Returns (classified_type, new_description)."""
    user_message = f"""Refine this Linear ticket draft:

**Title:** {issue.get('title', 'Untitled')}
**Description:**
{issue.get('description') or '(empty)'}

Return JSON with `type` and `new_description`.
"""

    model = os.environ.get("QUALITY_MODEL", "claude-haiku-4-5-20251001")
    payload = {
        "model": model,
        "max_tokens": 2500,
        "system": SYSTEM_PROMPT,
        "messages": [{"role": "user", "content": user_message}],
    }
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=body,
        method="POST",
        headers={
            "x-api-key": config.anthropic_api_key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())

    text = result["content"][0]["text"]
    start = text.find("{")
    end = text.rfind("}") + 1
    parsed = json.loads(text[start:end])
    return parsed["type"], parsed["new_description"]


def update_issue_description(api_key: str, issue_id: str, new_description: str, original: str) -> None:
    """Update issue description, preserving the original at the bottom as backup."""
    footer = f"\n\n---\n\n<details>\n<summary>Original description (pre-AI-refinement)</summary>\n\n{original or '(empty)'}\n\n</details>"
    full = new_description + footer

    mutation = """
    mutation Update($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
    """
    _graphql(api_key, mutation, {"id": issue_id, "input": {"description": full}})


def post_refinement_comment(api_key: str, issue_id: str, classified_type: str) -> None:
    body = f"""**AI Ticket Quality** refined this issue.

- Classified as: **{classified_type}**
- Restructured description with: Summary, AC, DoR, Technical Notes
- Original description preserved at the bottom of the description

*Engineering: review the AC before sprint commitment. Product: confirm classification.*"""

    mutation = """
    mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
    """
    _graphql(api_key, mutation, {"issueId": issue_id, "body": body})


def refine_one(identifier: str) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    if not api_key:
        raise ValueError("LINEAR_API_KEY required")

    config = Config()
    config.validate()

    issue = fetch_issue(api_key, identifier)
    if not issue:
        print(f"[quality] Issue {identifier} not found")
        return

    print(f"[quality] Refining {issue['identifier']}: {issue['title']}")
    classified_type, new_desc = refine(issue, config)
    print(f"[quality]   classified as: {classified_type}")

    update_issue_description(api_key, issue["id"], new_desc, issue.get("description") or "")
    post_refinement_comment(api_key, issue["id"], classified_type)
    print(f"[quality]   updated description + posted comment")


def watch_loop(interval: int = 180) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    config = Config()
    config.validate()

    while True:
        try:
            tickets = fetch_tickets_needing_refinement(api_key, team_id)
            if tickets:
                print(f"[quality] Found {len(tickets)} tickets needing refinement")
                for t in tickets:
                    try:
                        refine_one(t["identifier"])
                    except Exception as e:
                        print(f"[quality] Error on {t['identifier']}: {e}")
            else:
                print("[quality] No tickets need refinement")
        except Exception as e:
            print(f"[quality] Poll error: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AI Ticket Quality Pass")
    parser.add_argument("--issue", help="Refine a single issue (e.g., CC-375)")
    parser.add_argument("--watch", action="store_true", help="Poll for tickets labeled needs-refinement")
    parser.add_argument("--interval", type=int, default=180)
    args = parser.parse_args()

    if args.issue:
        refine_one(args.issue)
    elif args.watch:
        watch_loop(args.interval)
    else:
        parser.print_help()
