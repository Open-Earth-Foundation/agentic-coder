"""AI Calibration Agent — compares AI estimate vs Dev estimate vs historical data.

After an engineer sets an estimate on a Linear issue (via Shift+E), this agent:
1. Reads the AI Estimation Engine's prior suggestion from comments
2. Compares to the dev's actual estimate
3. Cross-references with historical samples (calibration data + similar past tickets)
4. If divergence is large (>= 2 T-shirt sizes), flags it for a 2-min discussion
5. Posts a calibration comment with the final "calibrated_points" recommendation

Usage:
    python -m agent_factory.calibrator --issue CC-375
    python -m agent_factory.calibrator --watch
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request

from .config import Config
from .estimator import load_calibration_data

GRAPHQL_URL = "https://api.linear.app/graphql"

# T-shirt to point mapping (matches Linear's Fibonacci-aligned scheme)
TSHIRT_TO_POINTS = {"XS": 1, "S": 2, "M": 3, "L": 5, "XL": 8}
POINTS_TO_TSHIRT = {v: k for k, v in TSHIRT_TO_POINTS.items()}

SYSTEM_PROMPT = """You are an AI calibration agent.

Given:
- AI estimate (T-shirt size + impact + confidence)
- Dev estimate (T-shirt size, set via Shift+E)
- Historical samples (similar past tickets with actual cycle times)

Your job is to:
1. Detect if there's significant divergence between AI and Dev (more than 1 T-shirt size apart).
2. Cross-reference with history: does this type of work in this area typically take longer than either estimate suggests?
3. Recommend a final "calibrated" size.
4. Be brief — the team has 2 minutes per ticket in sprint planning.

Respond ONLY with JSON:
{
  "divergence_severity": "none|low|medium|high",
  "calibrated_size": "XS|S|M|L|XL",
  "rationale": "1-2 sentence explanation. Cite historical pattern if relevant.",
  "discussion_needed": true|false
}
"""

AI_COMMENT_RE = re.compile(r"\*\*AI Estimation Suggestion\*\*.*?T-shirt Size.*?\*\*([A-Z]+)\*\*", re.DOTALL)


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


def fetch_issue_with_comments(api_key: str, identifier: str) -> dict:
    query = f"""
    {{
      issue(id: "{identifier}") {{
        id identifier title description estimate
        labels {{ nodes {{ name }} }}
        comments(first: 20) {{ nodes {{ id body createdAt }} }}
      }}
    }}
    """
    return _graphql(api_key, query).get("issue", {})


def fetch_issues_needing_calibration(api_key: str, team_id: str) -> list[dict]:
    """Find issues that have an estimate but no calibration comment yet.

    Strategy: pull recent issues with estimate set, filter client-side for those
    with an AI estimation comment but no calibration comment.
    """
    query = f"""
    {{
      issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          estimate: {{ null: false }}
          state: {{ type: {{ nin: ["completed", "canceled"] }} }}
        }}
        orderBy: updatedAt
        first: 50
      ) {{
        nodes {{
          id identifier title estimate
          comments(first: 20) {{ nodes {{ body }} }}
        }}
      }}
    }}
    """
    nodes = _graphql(api_key, query).get("issues", {}).get("nodes", [])
    candidates = []
    for n in nodes:
        bodies = [c["body"] for c in n.get("comments", {}).get("nodes", [])]
        has_ai = any("AI Estimation Suggestion" in b for b in bodies)
        has_calibration = any("AI Calibration" in b for b in bodies)
        if has_ai and not has_calibration:
            candidates.append(n)
    return candidates


def extract_ai_estimate(comments: list[dict]) -> str | None:
    """Extract the T-shirt size the AI Estimation Engine suggested."""
    for c in comments:
        body = c.get("body", "")
        if "AI Estimation Suggestion" not in body:
            continue
        m = AI_COMMENT_RE.search(body)
        if m:
            return m.group(1)
    return None


def points_to_tshirt(points: float) -> str:
    """Map numeric estimate (Linear's points) back to T-shirt size."""
    if points <= 1:
        return "XS"
    if points <= 2:
        return "S"
    if points <= 3:
        return "M"
    if points <= 5:
        return "L"
    return "XL"


def tshirt_distance(a: str, b: str) -> int:
    order = ["XS", "S", "M", "L", "XL"]
    try:
        return abs(order.index(a) - order.index(b))
    except ValueError:
        return 0


def calibrate(issue: dict, config: Config, calibration_data: dict | None) -> dict:
    """Use Claude to produce a calibration recommendation."""
    ai_size = extract_ai_estimate(issue.get("comments", {}).get("nodes", []))
    dev_points = issue.get("estimate") or 0
    dev_size = points_to_tshirt(dev_points)

    if not ai_size:
        return {"divergence_severity": "none", "calibrated_size": dev_size, "rationale": "No AI estimate found.", "discussion_needed": False}

    # Quick local divergence check before calling Claude
    distance = tshirt_distance(ai_size, dev_size)

    history_blurb = ""
    if calibration_data:
        history_blurb = f"\nHistorical baseline: avg cycle time {calibration_data['avg_cycle_time_days']}d from {calibration_data['sample_size']} samples ({calibration_data['source']})."

    user_message = f"""Calibrate this estimate:

**Issue:** {issue.get('title', 'Untitled')}
**AI estimate:** {ai_size}
**Dev estimate:** {dev_size} ({dev_points} points)
**T-shirt distance:** {distance} sizes apart
{history_blurb}

Respond with calibration JSON.
"""

    model = os.environ.get("CALIBRATOR_MODEL", "claude-haiku-4-5-20251001")
    payload = {
        "model": model,
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
    parsed["ai_size"] = ai_size
    parsed["dev_size"] = dev_size
    return parsed


def post_calibration_comment(api_key: str, issue_id: str, calibration: dict) -> None:
    severity = calibration.get("divergence_severity", "none")
    flag = ""
    if severity in ("medium", "high"):
        flag = "\n\n> ⚠️ **Discussion suggested.** Estimates diverge significantly — worth a 2-min chat in sprint planning."

    body = f"""**AI Calibration**

| | Size |
|---|---|
| AI suggested | {calibration.get('ai_size', '—')} |
| Dev set | {calibration.get('dev_size', '—')} |
| Calibrated | **{calibration.get('calibrated_size', '—')}** |

**Divergence:** {severity}
**Rationale:** {calibration.get('rationale', '')}
{flag}

*Final calibrated_size will be used for capacity planning. Dev's estimate stays as the human commitment.*"""

    mutation = """
    mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
    """
    _graphql(api_key, mutation, {"issueId": issue_id, "body": body})


def calibrate_one(identifier: str) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    if not api_key:
        raise ValueError("LINEAR_API_KEY required")
    config = Config()
    config.validate()
    calibration_data = load_calibration_data()

    issue = fetch_issue_with_comments(api_key, identifier)
    if not issue:
        print(f"[calibrator] Issue {identifier} not found")
        return

    if not issue.get("estimate"):
        print(f"[calibrator] {identifier} has no dev estimate yet, skipping")
        return

    result = calibrate(issue, config, calibration_data)
    print(f"[calibrator] {identifier}: AI={result.get('ai_size')} Dev={result.get('dev_size')} -> Calibrated={result.get('calibrated_size')} ({result.get('divergence_severity')})")
    post_calibration_comment(api_key, issue["id"], result)


def watch_loop(interval: int = 180) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    config = Config()
    config.validate()

    while True:
        try:
            candidates = fetch_issues_needing_calibration(api_key, team_id)
            if candidates:
                print(f"[calibrator] Found {len(candidates)} issues to calibrate")
                for c in candidates:
                    try:
                        calibrate_one(c["identifier"])
                    except Exception as e:
                        print(f"[calibrator] Error on {c['identifier']}: {e}")
            else:
                print("[calibrator] No new estimates to calibrate")
        except Exception as e:
            print(f"[calibrator] Poll error: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AI Calibration Agent")
    parser.add_argument("--issue", help="Calibrate a single issue (e.g., CC-375)")
    parser.add_argument("--watch", action="store_true", help="Poll for issues needing calibration")
    parser.add_argument("--interval", type=int, default=180)
    args = parser.parse_args()

    if args.issue:
        calibrate_one(args.issue)
    elif args.watch:
        watch_loop(args.interval)
    else:
        parser.print_help()
