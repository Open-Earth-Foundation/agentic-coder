"""AI Ticket Quality Gate — refines a Linear ticket AND decides if it's sprint-ready.

Behavior (approval flow):

1. Poll for issues labeled `ready-for-quality` (set by the Epic Decomposer or manually)
2. Read title + description
3. Ask Claude to (a) classify, (b) score description quality, (c) rewrite it
4. If quality >= threshold:
   - Update description with the refined version
   - Post an "approved" comment
   - Remove `ready-for-quality`, add `ready-for-estimation` (triggers next agent)
5. If quality < threshold:
   - Do NOT rewrite the description
   - Post a comment asking product for concrete corrections
   - Remove `ready-for-quality`, add `quality-fail`
   - Human resolves and manually re-adds `ready-for-quality` to trigger a fresh pass

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

SYSTEM_PROMPT = """You are the AI Ticket Quality Gate for Open Earth Foundation's engineering team.

You do TWO things:

1. GATE: judge if this ticket has enough information to be estimated and worked on:
   - PASS (score >= 6): title is clear, description explains WHAT + WHY, has (or can infer) acceptance criteria
   - FAIL (score < 6): missing critical context, acceptance criteria unclear, title too vague

2. If PASS: rewrite the description in the standard structure so it's sprint-ready.
   If FAIL: list what's missing so a human can fix it.

Standard structure (only used on PASS):

```
## Summary
2-3 sentence description of the work and its purpose.

## User Story
<!-- only if type=Story -->
As a [persona], I want [capability] so that [benefit].

## Context & Code References
- **Affected services:** list (app/frontend, global-api, hiap, climate-advisor)
- **Likely files:** if you can infer file paths, list them (best-effort — human validates)
- **Related patterns:** existing patterns to follow if applicable

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

## Technical Notes
- **Suggested approach:** brief
- **Migration needed:** Yes/No
- **New API endpoint:** Yes/No
- **i18n keys needed:** Yes/No
- **Feature flag:** Yes/No

## Open Questions
- (only if truly unresolved)
```

Classification rules:
- "bug"/"broken"/"fix"/"regression"/"error" → Bug
- "investigate"/"spike"/"explore"/"research"/"evaluate" → Spike (replace AC with "Questions to Answer")
- "incident"/"outage"/"down"/"production issue" → Incident (add Timeline section, skip estimation)
- User-facing capability → Story
- Internal/technical → Task

Respond ONLY with JSON:
{
  "quality_score": <1-10>,
  "type": "Story|Task|Bug|Spike|Incident",
  "gate_decision": "PASS" | "FAIL",
  "gaps": ["...", "..."],
  "new_description": "<full markdown, only when PASS>"
}

gaps is a list of concrete issues that must be fixed for FAIL, e.g.:
- "Title 'improve stuff' is too vague; specify what UI element or workflow"
- "No acceptance criteria; describe how someone would verify the fix"
- "Missing target audience; specify which user role this affects"
"""


def _graphql(api_key: str, query: str, variables: dict | None = None) -> dict:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        GRAPHQL_URL, data=body, method="POST",
        headers={"Authorization": api_key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())
    if result.get("errors"):
        raise RuntimeError(f"Linear error: {result['errors']}")
    return result.get("data", {})


def fetch_issue(api_key: str, identifier: str) -> dict:
    query = f"""
    {{ issue(id: "{identifier}") {{
        id identifier title description
        labels {{ nodes {{ id name }} }}
    }} }}
    """
    return _graphql(api_key, query).get("issue", {})


def fetch_tickets_ready_for_quality(api_key: str, team_id: str) -> list[dict]:
    """Fetch issues labeled `ready-for-quality` and not already gated."""
    query = f"""
    {{ issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          labels: {{ some: {{ name: {{ eq: "ready-for-quality" }} }} }}
          state: {{ type: {{ nin: ["completed", "canceled"] }} }}
        }}
        first: 10
    ) {{ nodes {{
        id identifier title description
        labels {{ nodes {{ id name }} }}
    }} }} }}
    """
    return _graphql(api_key, query).get("issues", {}).get("nodes", [])


def refine(issue: dict, config: Config) -> dict:
    """Ask Claude to gate + refine. Returns full JSON payload."""
    user_message = f"""Gate this Linear ticket:

**Title:** {issue.get('title', 'Untitled')}
**Description:**
{issue.get('description') or '(empty)'}

Return JSON with quality_score, type, gate_decision, gaps, new_description.
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
        data=body, method="POST",
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
    return json.loads(text[start:end])


def _resolve_label_ids(api_key: str, team_id: str, names: list[str]) -> dict[str, str]:
    """Resolve label names to their IDs (only names that exist)."""
    query = f"""
    {{ issueLabels(filter: {{ team: {{ id: {{ eq: "{team_id}" }} }} }}, first: 250) {{ nodes {{ id name }} }} }}
    """
    data = _graphql(api_key, query)
    all_labels = {n["name"].lower(): n["id"] for n in data.get("issueLabels", {}).get("nodes", [])}
    return {name: all_labels[name.lower()] for name in names if name.lower() in all_labels}


def swap_labels(api_key: str, team_id: str, issue_id: str, remove_names: list[str], add_names: list[str]) -> None:
    """Remove one set of labels, add another, on an issue."""
    label_map = _resolve_label_ids(api_key, team_id, remove_names + add_names)

    issue_q = f'{{ issue(id: "{issue_id}") {{ labels {{ nodes {{ id name }} }} }} }}'
    issue_data = _graphql(api_key, issue_q)
    existing = issue_data.get("issue", {}).get("labels", {}).get("nodes", [])
    existing_ids = [l["id"] for l in existing]

    # Remove
    for name in remove_names:
        rid = label_map.get(name)
        if rid and rid in existing_ids:
            existing_ids.remove(rid)
    # Add
    for name in add_names:
        aid = label_map.get(name)
        if aid and aid not in existing_ids:
            existing_ids.append(aid)

    mutation = """
    mutation Update($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
    """
    _graphql(api_key, mutation, {"id": issue_id, "input": {"labelIds": existing_ids}})


def update_description(api_key: str, issue_id: str, new_description: str, original: str) -> None:
    footer = f"\n\n---\n\n<details>\n<summary>Original description (pre-AI-refinement)</summary>\n\n{original or '(empty)'}\n\n</details>"
    mutation = """
    mutation Update($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
    """
    _graphql(api_key, mutation, {"id": issue_id, "input": {"description": new_description + footer}})


def post_pass_comment(api_key: str, issue_id: str, classified_type: str, quality_score: int) -> None:
    body = f"""**AI Quality Gate: PASS** (score {quality_score}/10)

- Classified as: **{classified_type}**
- Description restructured with: Summary, AC, DoR, Technical Notes
- Original preserved at the bottom of the description
- Labels swapped: `ready-for-quality` → `ready-for-estimation`

*Next: AI Estimation Engine will score this within ~2 minutes.*"""
    mutation = """
    mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
    """
    _graphql(api_key, mutation, {"issueId": issue_id, "body": body})


def post_fail_comment(api_key: str, issue_id: str, classified_type: str, quality_score: int, gaps: list[str]) -> None:
    gap_lines = "\n".join(f"- {g}" for g in gaps)
    body = f"""**AI Quality Gate: FAIL** (score {quality_score}/10)

- Provisional classification: **{classified_type}**
- Labels swapped: `ready-for-quality` → `quality-fail`

**Gaps found:**
{gap_lines}

**What to do next**
1. Address the gaps above by editing the description
2. When ready, remove the `quality-fail` label and add `ready-for-quality` again
3. The Quality Gate will re-run automatically

*If you disagree with this gate and want to bypass, add `ready-for-estimation` directly.*"""
    mutation = """
    mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
    """
    _graphql(api_key, mutation, {"issueId": issue_id, "body": body})


def process_one(identifier: str) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    if not api_key or not team_id:
        raise ValueError("LINEAR_API_KEY + LINEAR_TEAM_ID required")

    config = Config()
    config.validate()

    issue = fetch_issue(api_key, identifier)
    if not issue:
        print(f"[quality] Issue {identifier} not found")
        return

    print(f"[quality] Gating {issue['identifier']}: {issue['title']}")
    result = refine(issue, config)
    print(f"[quality]   score={result.get('quality_score')} decision={result.get('gate_decision')}")

    if result.get("gate_decision") == "PASS":
        update_description(api_key, issue["id"], result["new_description"], issue.get("description") or "")
        post_pass_comment(api_key, issue["id"], result["type"], result["quality_score"])
        swap_labels(api_key, team_id, issue["id"], ["ready-for-quality", "quality-fail"], ["ready-for-estimation"])
        print(f"[quality]   PASS -> marked ready-for-estimation")
    else:
        post_fail_comment(api_key, issue["id"], result["type"], result["quality_score"], result.get("gaps", []))
        swap_labels(api_key, team_id, issue["id"], ["ready-for-quality"], ["quality-fail"])
        print(f"[quality]   FAIL -> marked quality-fail with {len(result.get('gaps', []))} gaps")


def watch_loop(interval: int = 180) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    config = Config()
    config.validate()

    while True:
        try:
            tickets = fetch_tickets_ready_for_quality(api_key, team_id)
            if tickets:
                print(f"[quality] Found {len(tickets)} tickets ready for quality")
                for t in tickets:
                    try:
                        process_one(t["identifier"])
                    except Exception as e:
                        print(f"[quality] Error on {t['identifier']}: {e}")
            else:
                print("[quality] No tickets ready for quality")
        except Exception as e:
            print(f"[quality] Poll error: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AI Ticket Quality Gate")
    parser.add_argument("--issue", help="Gate a single issue (e.g., CC-375)")
    parser.add_argument("--watch", action="store_true", help="Poll for tickets labeled ready-for-quality")
    parser.add_argument("--interval", type=int, default=180)
    args = parser.parse_args()
    if args.issue:
        process_one(args.issue)
    elif args.watch:
        watch_loop(args.interval)
    else:
        parser.print_help()
