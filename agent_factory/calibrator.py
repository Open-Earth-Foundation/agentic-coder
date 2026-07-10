"""AI Calibration Agent — final estimate recommendation after the dev has voted.

Trigger: an issue that has been AI-estimated (label `ai-estimated`), has a numeric
estimate set by the human (via Shift+E), and has NOT been calibrated yet
(no `ai-calibrated` label).

The agent reads:
- The AI Estimation Suggestion from comments (extracted via regex)
- The dev's numeric estimate on the issue
- ALL other comments on the issue since the AI estimation (dev may have posted
  rationale explaining why they voted a certain way — this is critical context
  we did NOT read before)
- Similar historical completed issues (same labels, same assignee if possible)
- Global calibration baseline

Output: one calibration comment with:
- Severity (none / low / medium / high)
- Recommended calibrated_size
- Rationale that references the dev's stated reasons where relevant
- If divergence is medium/high: prompt for a 2-min discussion

Then adds `ai-calibrated` label so we don't re-process.
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

TSHIRT_TO_POINTS = {"XS": 1, "S": 2, "M": 3, "L": 5, "XL": 8}
POINTS_TO_TSHIRT = {v: k for k, v in TSHIRT_TO_POINTS.items()}

SYSTEM_PROMPT = """You are the AI Calibration Agent for OEF's engineering team.

Your job is the FINAL calibration in the estimation pipeline. You come after:
- Step 6 (AI Estimation Engine) posted its suggestion
- Step 7 (Sprint Planning) — the dev(s) voted their own T-shirt via Shift+E and may have
  posted comments explaining WHY they voted differently

You now read all of the above + historical patterns, and issue a final recommendation
that either endorses the dev's vote (most cases), the AI's suggestion, or something in between.

Ground rules:
1. Trust the dev's numeric estimate as the human commitment. You are NOT overruling — you
   are producing a "calibrated_size" for capacity planning that the team can debate.
2. Read the dev's rationale carefully. If they cite a specific reason (e.g., "this touches
   a legacy module I know is brittle"), that outweighs history.
3. Look at similar past issues with actual cycle times. If AI or Dev is way off history,
   flag it.
4. Be brief. The team has 2 min per ticket in sprint planning.

Severity:
- none: AI, Dev, and history all agree (within 1 size)
- low: 1 T-shirt size delta, minor discussion
- medium: 2 T-shirt sizes delta OR dev cites unstated risk not in AI reasoning
- high: 3+ sizes delta OR history strongly contradicts both

Respond ONLY with JSON:
{
  "divergence_severity": "none|low|medium|high",
  "calibrated_size": "XS|S|M|L|XL",
  "rationale": "2-3 sentences. Cite specific dev comments or historical examples if relevant.",
  "discussion_needed": true|false
}
"""

AI_COMMENT_RE = re.compile(r"\*\*AI Estimation Suggestion\*\*.*?T-shirt Size.*?\*\*([A-Z]+)\*\*", re.DOTALL)
AI_IMPACT_RE = re.compile(r"Impact Score \|\s*(\d+)/100", re.DOTALL)


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


def fetch_issue_full(api_key: str, identifier: str) -> dict:
    query = f"""
    {{ issue(id: "{identifier}") {{
        id identifier title description estimate
        labels {{ nodes {{ id name }} }}
        assignee {{ name }}
        comments(first: 50) {{ nodes {{ id body createdAt user {{ name }} }} }}
    }} }}
    """
    return _graphql(api_key, query).get("issue", {})


def fetch_issues_needing_calibration(api_key: str, team_id: str) -> list[dict]:
    """Find issues that have been AI-estimated, have a dev estimate, but no calibration yet.

    Strategy: filter by `ai-estimated` label + `estimate != null` + `ai-calibrated` absent.
    """
    query = f"""
    {{ issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          labels: {{ some: {{ name: {{ eq: "ai-estimated" }} }} }}
          estimate: {{ null: false }}
          state: {{ type: {{ nin: ["completed", "canceled"] }} }}
          and: [{{ labels: {{ every: {{ name: {{ neq: "ai-calibrated" }} }} }} }}]
        }}
        orderBy: updatedAt
        first: 20
    ) {{ nodes {{ id identifier title }} }} }}
    """
    return _graphql(api_key, query).get("issues", {}).get("nodes", [])


def fetch_similar_completed(api_key: str, team_id: str, area_labels: list[str], limit: int = 5) -> list[dict]:
    if not area_labels:
        return []
    query = f"""
    {{ issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          state: {{ type: {{ eq: "completed" }} }}
          estimate: {{ null: false }}
        }}
        orderBy: updatedAt
        first: 30
    ) {{ nodes {{
        identifier title estimate assignee {{ name }}
        labels {{ nodes {{ name }} }}
        startedAt completedAt
    }} }} }}
    """
    data = _graphql(api_key, query)
    nodes = data.get("issues", {}).get("nodes", [])
    area_set = set(l.lower() for l in area_labels)
    scored = []
    for n in nodes:
        labels = [l["name"].lower() for l in n.get("labels", {}).get("nodes", [])]
        overlap = len(area_set & set(labels))
        if overlap > 0:
            scored.append((overlap, n))
    scored.sort(key=lambda x: -x[0])
    return [n for _, n in scored[:limit]]


def extract_ai_estimate(comments: list[dict]) -> tuple[str | None, int | None]:
    """Return (t_shirt, impact_score) from the most recent AI Estimation comment."""
    ai_comments = [c for c in comments if "AI Estimation Suggestion" in c.get("body", "")]
    if not ai_comments:
        return None, None
    ai_comments.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    latest = ai_comments[0]["body"]
    size_m = AI_COMMENT_RE.search(latest)
    impact_m = AI_IMPACT_RE.search(latest)
    return (size_m.group(1) if size_m else None,
            int(impact_m.group(1)) if impact_m else None)


def collect_dev_rationale(comments: list[dict], ai_size: str | None) -> list[str]:
    """Return dev/human comments that came AFTER the AI estimation (potential rationale).

    Excludes system/bot comments. Keeps only human authors and only those posted after
    the AI Estimation comment.
    """
    ai_comments = [c for c in comments if "AI Estimation Suggestion" in c.get("body", "")]
    if not ai_comments:
        return []
    ai_comments.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    latest_ai_ts = ai_comments[0]["createdAt"]

    rationale = []
    for c in comments:
        if c.get("createdAt", "") <= latest_ai_ts:
            continue
        body = c.get("body", "")
        # skip our own agent comments
        if any(marker in body for marker in ("AI Estimation Suggestion", "AI Calibration", "AI Quality Gate", "AI Epic Decomposer", "Agent completed this task")):
            continue
        author = (c.get("user") or {}).get("name", "?")
        rationale.append(f"{author}: {body[:400]}")
    return rationale


def points_to_tshirt(points: float) -> str:
    if points <= 1: return "XS"
    if points <= 2: return "S"
    if points <= 3: return "M"
    if points <= 5: return "L"
    return "XL"


def tshirt_distance(a: str, b: str) -> int:
    order = ["XS", "S", "M", "L", "XL"]
    try:
        return abs(order.index(a) - order.index(b))
    except ValueError:
        return 0


def calibrate(issue: dict, config: Config, calibration_data: dict | None, similar: list[dict]) -> dict:
    comments = issue.get("comments", {}).get("nodes", [])
    ai_size, ai_impact = extract_ai_estimate(comments)
    dev_points = issue.get("estimate") or 0
    dev_size = points_to_tshirt(dev_points)
    dev_rationale = collect_dev_rationale(comments, ai_size)
    assignee = issue.get("assignee", {}).get("name") if issue.get("assignee") else None

    distance = tshirt_distance(ai_size, dev_size) if ai_size else 0

    history_blurb = ""
    if calibration_data:
        history_blurb = f"Global baseline: avg cycle time {calibration_data['avg_cycle_time_days']}d from {calibration_data['sample_size']} samples."

    similar_lines = []
    from datetime import datetime
    for s in similar[:5]:
        actual_days = None
        if s.get("startedAt") and s.get("completedAt"):
            try:
                st = datetime.fromisoformat(s["startedAt"].replace("Z", "+00:00"))
                en = datetime.fromisoformat(s["completedAt"].replace("Z", "+00:00"))
                actual_days = round((en - st).total_seconds() / 86400, 1)
            except Exception:
                pass
        est_label = {1: "XS", 2: "S", 3: "M", 5: "L", 8: "XL"}.get(s.get("estimate", 0), "?")
        who = s.get("assignee", {}).get("name") if s.get("assignee") else "?"
        similar_lines.append(f"- {s['identifier']}: '{s['title'][:50]}' est={est_label}, actual={actual_days}d, by={who}")

    dev_rationale_block = "\nDev comments posted after AI estimation (potential rationale):\n" + ("\n".join(f"  - {r}" for r in dev_rationale) if dev_rationale else "  (none)")

    user_message = f"""Calibrate this estimate:

**Issue:** {issue.get('title')}
**Assignee:** {assignee or 'unassigned'}
**AI estimate:** {ai_size} (impact score {ai_impact}/100)
**Dev estimate:** {dev_size} ({dev_points} points)
**T-shirt distance AI vs Dev:** {distance} sizes

{history_blurb}

Similar past completed work by same area labels:
{chr(10).join(similar_lines) if similar_lines else '(none found)'}
{dev_rationale_block}

Recommend the final calibrated_size.
"""

    model = os.environ.get("CALIBRATOR_MODEL", "claude-haiku-4-5-20251001")
    payload = {
        "model": model,
        "max_tokens": 600,
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
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    text = result["content"][0]["text"]
    start = text.find("{"); end = text.rfind("}") + 1
    parsed = json.loads(text[start:end])
    parsed["ai_size"] = ai_size
    parsed["dev_size"] = dev_size
    parsed["dev_rationale_count"] = len(dev_rationale)
    return parsed


def mark_calibrated(api_key: str, team_id: str, issue_id: str) -> None:
    """Add `ai-calibrated` label."""
    q = f"""
    {{ issueLabels(filter: {{ team: {{ id: {{ eq: "{team_id}" }} }} }}, first: 250) {{ nodes {{ id name }} }} }}
    """
    data = _graphql(api_key, q)
    m = {n["name"].lower(): n["id"] for n in data.get("issueLabels", {}).get("nodes", [])}
    cal_id = m.get("ai-calibrated")
    if not cal_id:
        return
    issue_q = f'{{ issue(id: "{issue_id}") {{ labels {{ nodes {{ id }} }} }} }}'
    existing = [n["id"] for n in _graphql(api_key, issue_q).get("issue", {}).get("labels", {}).get("nodes", [])]
    if cal_id not in existing:
        existing.append(cal_id)
    _graphql(api_key, """
    mutation Update($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
    """, {"id": issue_id, "input": {"labelIds": existing}})


def post_calibration_comment(api_key: str, issue_id: str, cal: dict) -> None:
    severity = cal.get("divergence_severity", "none")
    flag = ""
    if severity in ("medium", "high"):
        flag = "\n\n> ⚠️ **Discussion suggested.** Estimates diverge significantly — worth a 2-min chat in sprint planning."

    rationale_note = ""
    if cal.get("dev_rationale_count", 0) > 0:
        rationale_note = f"\n\n*This calibration considered {cal['dev_rationale_count']} dev comment(s) posted after the AI estimation.*"

    body = f"""**AI Calibration**

| | Size |
|---|---|
| AI suggested | {cal.get('ai_size', '—')} |
| Dev set (Shift+E) | {cal.get('dev_size', '—')} |
| Calibrated (final for capacity planning) | **{cal.get('calibrated_size', '—')}** |

**Divergence:** {severity}
**Rationale:** {cal.get('rationale', '')}
{flag}
{rationale_note}
---
*The dev's estimate stays as the human commitment. `calibrated_size` is used for portfolio-level capacity planning.*"""
    _graphql(api_key, """
    mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
    """, {"issueId": issue_id, "body": body})


def calibrate_one(identifier: str) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    if not api_key:
        raise ValueError("LINEAR_API_KEY required")
    config = Config()
    config.validate()

    issue = fetch_issue_full(api_key, identifier)
    if not issue:
        print(f"[calibrator] {identifier} not found")
        return
    if not issue.get("estimate"):
        print(f"[calibrator] {identifier} has no dev estimate yet, skipping")
        return

    calibration_data = load_calibration_data()
    area_labels = [l["name"] for l in issue.get("labels", {}).get("nodes", [])
                   if l["name"] not in ("ai-estimated", "ai-calibrated", "ready-for-estimation", "ready-for-quality", "quality-fail", "ai-proposed", "agent-ready", "needs-decomposition", "roi-measured")]
    similar = []
    try:
        similar = fetch_similar_completed(api_key, team_id, area_labels)
    except Exception:
        pass

    result = calibrate(issue, config, calibration_data, similar)
    print(f"[calibrator] {identifier}: AI={result.get('ai_size')} Dev={result.get('dev_size')} -> {result.get('calibrated_size')} ({result.get('divergence_severity')}, {result.get('dev_rationale_count')} dev comments)")

    post_calibration_comment(api_key, issue["id"], result)
    mark_calibrated(api_key, team_id, issue["id"])


def watch_loop(interval: int = 180) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    Config().validate()

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
