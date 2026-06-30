"""AI Estimation Engine — auto-scores new Linear issues.

Polls Linear for issues without estimates, uses Claude to analyze
complexity and suggest T-shirt size + impact score, then posts the
suggestion as a comment on the issue.

Usage:
    python -m agent_factory.estimator [--once] [--interval 120]
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from dataclasses import dataclass

from .config import Config

GRAPHQL_URL = "https://api.linear.app/graphql"

IMPACT_DIMENSIONS = """
Score each dimension 1-10:
- User Impact (30%): How many cities/users benefit? How much?
- Mission Alignment (25%): Does it advance GHG reduction / climate action?
- Revenue/Funding (20%): Does it unlock revenue, grants, or partnerships?
- Technical Health (15%): Reduces debt, improves reliability?
- Team Velocity (10%): Makes future work faster? Developer experience?
"""

TSHIRT_GUIDE = """
T-shirt sizing guide — AI-EMPOWERED estimates (our team uses Cursor, Claude, agentic coding agents, and AI-assisted skills for nearly everything):

- XS: < 1 hour. Typo fix, config change, one-line fix, add translation key.
- S: 2-4 hours. Simple bugfix, small UI change, add component variant, straightforward API endpoint.
- M: 1 day. New feature with 2-3 files, moderate refactor, new service endpoint with tests.
- L: 2-3 days. Multi-file feature touching frontend + backend, new integration, complex bug requiring investigation.
- XL: 4-5 days. Large cross-cutting feature, architecture change, new service. Should be broken down.

IMPORTANT CALIBRATION RULES:
1. Our team is AI-empowered. Estimates should be ~50% LOWER than traditional (non-AI) engineering teams.
2. Exception: Infrastructure/deploy/networking tasks where AI hallucinates often — estimate those at normal speed.
3. Documentation and research tasks are also accelerated by AI (~40% faster than traditional).
4. If the task involves only code changes (no infra/deploy), bias toward the SMALLER size.
5. Historical average: our team completes ~25-30 tasks per 2-week sprint with ~10 people. That's 2-3 tasks/person/week.
"""

SYSTEM_PROMPT = f"""You are an AI estimation engine for Open Earth Foundation's engineering team.
Your job is to analyze a Linear issue and produce:
1. An impact score (0-100) based on weighted dimensions
2. A T-shirt size suggestion (XS, S, M, L, XL)
3. A brief rationale (2-3 sentences)

{IMPACT_DIMENSIONS}

{TSHIRT_GUIDE}

Respond ONLY with valid JSON in this exact format:
{{
  "impact_score": <number 0-100>,
  "confidence": <number 0.1-1.0>,
  "tshirt_suggestion": "<XS|S|M|L|XL>",
  "rationale": "<2-3 sentences explaining the estimate>",
  "decomposition_needed": <true if XL and should be broken down>
}}
"""


@dataclass
class EstimationResult:
    impact_score: int
    confidence: float
    tshirt_suggestion: str
    rationale: str
    decomposition_needed: bool


def _linear_graphql(api_key: str, query: str, variables: dict | None = None) -> dict:
    payload = {"query": query}
    if variables:
        payload["variables"] = variables

    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        GRAPHQL_URL,
        data=body,
        method="POST",
        headers={
            "Authorization": api_key,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        result = json.loads(resp.read())

    if result.get("errors"):
        raise RuntimeError(f"Linear GraphQL error: {result['errors']}")
    return result.get("data", {})


def fetch_unestimated_issues(api_key: str, team_id: str, limit: int = 10) -> list[dict]:
    """Fetch issues that have no estimate AND have not been scored by us yet.

    The exclusion criteria is the `ai-estimated` label which we set immediately
    after posting our suggestion. Without it, this query would keep returning
    the same issues every poll cycle and we'd burn API credits in a loop.
    """
    query = f"""
    query {{
      issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          estimate: {{ null: true }}
          state: {{ type: {{ nin: ["completed", "canceled"] }} }}
          labels: {{ every: {{ name: {{ neq: "ai-estimated" }} }} }}
        }}
        orderBy: createdAt
        first: {limit}
      ) {{
        nodes {{
          id
          identifier
          title
          description
          priority
          project {{ name description }}
          parent {{ identifier title description }}
          labels {{ nodes {{ name }} }}
          state {{ name }}
          createdAt
        }}
      }}
    }}
    """
    data = _linear_graphql(api_key, query)
    return data.get("issues", {}).get("nodes", [])


def fetch_similar_completed_issues(api_key: str, team_id: str, area_labels: list[str], limit: int = 5) -> list[dict]:
    """Fetch up to N recently completed issues with matching area labels.

    Used to ground the estimate in real historical cycle times for similar work.
    """
    if not area_labels:
        return []
    # Linear GraphQL doesn't trivially do OR on labels via filter syntax in a one-shot,
    # so fetch by team + state=completed and let the caller filter by overlap.
    query = f"""
    query {{
      issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          state: {{ type: {{ eq: "completed" }} }}
          estimate: {{ null: false }}
        }}
        orderBy: updatedAt
        first: 30
      ) {{
        nodes {{
          identifier title estimate
          labels {{ nodes {{ name }} }}
          startedAt completedAt
        }}
      }}
    }}
    """
    data = _linear_graphql(api_key, query)
    nodes = data.get("issues", {}).get("nodes", [])
    # Score overlap with the current issue's labels
    area_set = set(l.lower() for l in area_labels)
    scored = []
    for n in nodes:
        labels = [l["name"].lower() for l in n.get("labels", {}).get("nodes", [])]
        overlap = len(area_set & set(labels))
        if overlap > 0:
            scored.append((overlap, n))
    scored.sort(key=lambda x: -x[0])
    return [n for _, n in scored[:limit]]


def estimate_issue(issue: dict, config: Config, calibration_data: dict | None = None, similar_issues: list[dict] | None = None) -> EstimationResult:
    """Use Claude to estimate a single issue.

    Context layers (in order of priority):
    1. The issue itself: title, description, priority, labels, state
    2. Parent epic: name, description (so the estimator knows what business value
       this work serves and what the broader scope is)
    3. Project / initiative context (name + description)
    4. Similar past completed issues with the same area labels (real cycle times,
       not just a global average)
    5. Global historical baseline (calibration_data)
    """
    project_context = ""
    if issue.get("project"):
        proj = issue["project"]
        project_context = f"\nInitiative: {proj.get('name', 'Unknown')}"
        if proj.get("description"):
            project_context += f"\nInitiative description: {proj['description'][:400]}"

    parent_context = ""
    if issue.get("parent"):
        p = issue["parent"]
        parent_context = f"\nParent epic ({p.get('identifier', '?')}): {p.get('title', '')}"
        if p.get("description"):
            parent_context += f"\nParent epic description: {p['description'][:500]}"

    labels = [l["name"] for l in issue.get("labels", {}).get("nodes", [])]
    label_str = ", ".join(labels) if labels else "none"

    calibration_hint = ""
    if calibration_data:
        avg_cycle = calibration_data.get("avg_cycle_time_days", 10)
        calibration_hint = f"\nHistorical baseline: team average cycle time is ~{avg_cycle} days per task (across {calibration_data.get('sample_size', 0)} past tickets)."

    similar_block = ""
    if similar_issues:
        lines = []
        for s in similar_issues[:5]:
            actual_days = None
            if s.get("startedAt") and s.get("completedAt"):
                from datetime import datetime
                try:
                    start = datetime.fromisoformat(s["startedAt"].replace("Z", "+00:00"))
                    end = datetime.fromisoformat(s["completedAt"].replace("Z", "+00:00"))
                    actual_days = round((end - start).total_seconds() / 86400, 1)
                except Exception:
                    pass
            est_label = {1: "XS", 2: "S", 3: "M", 5: "L", 8: "XL"}.get(s.get("estimate", 0), str(s.get("estimate", "?")))
            actual_str = f"{actual_days}d actual" if actual_days is not None else "no end date"
            lines.append(f"- {s.get('identifier','?')}: '{s.get('title','')[:60]}' estimated {est_label}, {actual_str}")
        similar_block = "\nSimilar past completed work (same labels):\n" + "\n".join(lines)

    user_message = f"""Estimate this Linear issue:

**Title:** {issue.get('title', 'Untitled')}
**Description:** {issue.get('description') or 'No description provided.'}
**Priority:** {issue.get('priority', 'Unknown')}
**Labels:** {label_str}
**Status:** {issue.get('state', {}).get('name', 'Unknown')}{project_context}{parent_context}{calibration_hint}{similar_block}
"""

    estimation_model = os.environ.get("ESTIMATION_MODEL", "claude-haiku-4-5-20251001")
    payload = {
        "model": estimation_model,
        "max_tokens": 500,
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

    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())

    text = result["content"][0]["text"]
    start = text.find("{")
    end = text.rfind("}") + 1
    parsed = json.loads(text[start:end])

    return EstimationResult(
        impact_score=parsed["impact_score"],
        confidence=parsed["confidence"],
        tshirt_suggestion=parsed["tshirt_suggestion"],
        rationale=parsed["rationale"],
        decomposition_needed=parsed.get("decomposition_needed", False),
    )


def post_estimation_comment(api_key: str, issue_id: str, result: EstimationResult) -> None:
    """Post the estimation as a comment on the Linear issue."""
    decomp_note = ""
    if result.decomposition_needed:
        decomp_note = "\n> **Note:** This issue is XL and should be decomposed into smaller tasks before sprint commitment.\n"

    comment = f"""**AI Estimation Suggestion**

| Metric | Value |
|--------|-------|
| Impact Score | {result.impact_score}/100 |
| Confidence | {result.confidence:.1f} |
| T-shirt Size | **{result.tshirt_suggestion}** |

**Rationale:** {result.rationale}
{decomp_note}
---
*Auto-generated by AI Estimation Engine. Dev: confirm or adjust via Shift+E.*"""

    mutation = """
    mutation AddComment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
    """
    _linear_graphql(api_key, mutation, {"issueId": issue_id, "body": comment})


def mark_issue_as_estimated(api_key: str, issue_id: str, team_id: str) -> None:
    """Attach the `ai-estimated` label so the polling query skips this issue.

    Without this the estimator re-scores the same issue on every poll cycle.
    """
    # Resolve the label ID once
    label_q = f"""
    {{ issueLabels(filter: {{ name: {{ eq: "ai-estimated" }}, team: {{ id: {{ eq: "{team_id}" }} }} }}) {{ nodes {{ id }} }} }}
    """
    data = _linear_graphql(api_key, label_q)
    nodes = data.get("issueLabels", {}).get("nodes", [])
    if not nodes:
        # Auto-create if missing
        create = """
        mutation Create($input: IssueLabelCreateInput!) {
          issueLabelCreate(input: $input) { success issueLabel { id } }
        }
        """
        created = _linear_graphql(api_key, create, {
            "input": {"name": "ai-estimated", "color": "#22D3EE", "teamId": team_id}
        })
        label_id = created.get("issueLabelCreate", {}).get("issueLabel", {}).get("id")
    else:
        label_id = nodes[0]["id"]
    if not label_id:
        return
    mutation = """
    mutation AddLabel($issueId: String!, $labelIds: [String!]!) {
      issueAddLabel(id: $issueId, labelId: $labelIds) { success }
    }
    """
    # Linear v2 mutation: issueUpdate with labelIds (additive via labelIds union)
    # Simpler: just call issueUpdate with the label added.
    issue_q = f'{{ issue(id: "{issue_id}") {{ labels {{ nodes {{ id }} }} }} }}'
    issue_data = _linear_graphql(api_key, issue_q)
    existing = [n["id"] for n in issue_data.get("issue", {}).get("labels", {}).get("nodes", [])]
    if label_id not in existing:
        existing.append(label_id)
    update_mut = """
    mutation Update($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
    """
    _linear_graphql(api_key, update_mut, {"id": issue_id, "input": {"labelIds": existing}})


def load_calibration_data() -> dict | None:
    """Load historical calibration data if available."""
    candidates = [
        os.environ.get("CALIBRATION_DATA_PATH", ""),
        os.path.join(os.path.dirname(__file__), "..", "..", ".docs", "estimation-calibration-data.json"),
        os.path.expanduser("~/Desktop/openearth/.docs/estimation-calibration-data.json"),
    ]

    cal_path = None
    for path in candidates:
        if path and os.path.isfile(path):
            cal_path = path
            break

    if not cal_path:
        return None

    with open(cal_path) as f:
        data = json.load(f)

    tasks = data.get("calibration_data", data.get("tasks", []))
    if not tasks:
        return None

    cycle_times = [t["cycle_time_days"] for t in tasks if t.get("cycle_time_days")]
    avg = sum(cycle_times) / len(cycle_times) if cycle_times else 10

    return {
        "avg_cycle_time_days": round(avg, 1),
        "sample_size": len(cycle_times),
        "source": data.get("metadata", {}).get("source", "unknown"),
    }


def run_estimation_loop(once: bool = False, interval: int = 120) -> None:
    """Main loop: poll Linear, estimate unscored issues, post comments."""
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")

    if not api_key:
        raise ValueError("LINEAR_API_KEY not set")
    if not team_id:
        raise ValueError("LINEAR_TEAM_ID not set")

    config = Config()
    config.validate()

    calibration = load_calibration_data()
    if calibration:
        print(f"[estimator] Loaded calibration: avg {calibration['avg_cycle_time_days']}d "
              f"from {calibration['sample_size']} samples ({calibration['source']})")
    else:
        print("[estimator] No calibration data found — estimates will be uncalibrated")

    while True:
        try:
            issues = fetch_unestimated_issues(api_key, team_id)
            if issues:
                print(f"[estimator] Found {len(issues)} unestimated issues")
                for issue in issues:
                    ident = issue["identifier"]
                    title = issue["title"][:60]
                    print(f"[estimator] Scoring {ident}: {title}...")

                    try:
                        # Grab a few similar past completed tickets (same labels) so the
                        # estimate is grounded in real history, not just a global baseline.
                        area_labels = [l["name"] for l in issue.get("labels", {}).get("nodes", [])
                                       if l["name"] not in ("ai-estimated", "agent-ready", "ai-proposed", "needs-decomposition", "needs-refinement")]
                        similar = []
                        try:
                            similar = fetch_similar_completed_issues(api_key, team_id, area_labels)
                        except Exception:
                            pass

                        result = estimate_issue(issue, config, calibration, similar_issues=similar)
                        post_estimation_comment(api_key, issue["id"], result)
                        # Mark with `ai-estimated` so we don't re-process this every poll.
                        try:
                            mark_issue_as_estimated(api_key, issue["id"], team_id)
                        except Exception as label_err:
                            print(f"[estimator]   warning: could not add ai-estimated label to {ident}: {label_err}")
                        print(f"[estimator]   -> {result.tshirt_suggestion} "
                              f"(impact={result.impact_score}, conf={result.confidence:.1f}, similar={len(similar)})")
                    except Exception as e:
                        print(f"[estimator]   ERROR on {ident}: {e}")

            else:
                print("[estimator] No unestimated issues found")

        except Exception as e:
            print(f"[estimator] Poll error: {e}")

        if once:
            break

        print(f"[estimator] Sleeping {interval}s...")
        time.sleep(interval)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AI Estimation Engine for Linear")
    parser.add_argument("--once", action="store_true", help="Run once then exit")
    parser.add_argument("--interval", type=int, default=120, help="Poll interval in seconds")
    args = parser.parse_args()

    run_estimation_loop(once=args.once, interval=args.interval)
