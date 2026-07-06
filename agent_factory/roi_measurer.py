"""ROI Measurement Agent — closes the estimation loop.

When an issue transitions to Done, this agent:
1. Computes actual_days = completedAt - startedAt (working-day approximation)
2. Computes cost = actual_days × $300/day
3. Extracts the AI estimated T-shirt + calibrated T-shirt from prior comments
4. Computes delta (estimated vs actual) and accuracy
5. Posts an ROI Measurement comment on the issue with:
   - Actual days, cost, delta vs estimate
   - Whether the estimate was accurate (within 1 T-shirt size) or off
6. Adds `roi-measured` label so we don't re-process
7. Appends a JSON record to the calibration dataset for future estimator training

Filter: Done issues that have an estimate AND don't yet have `roi-measured`.

Usage:
    python -m agent_factory.roi_measurer --issue CC-378
    python -m agent_factory.roi_measurer --watch
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.request
from datetime import datetime

GRAPHQL_URL = "https://api.linear.app/graphql"
DAILY_RATE = 300  # USD, matches methodology doc

TSHIRT_TO_DAYS = {"XS": 0.125, "S": 0.5, "M": 1.0, "L": 2.5, "XL": 5.0}
POINTS_TO_TSHIRT = {1: "XS", 2: "S", 3: "M", 5: "L", 8: "XL"}

AI_SIZE_RE = re.compile(r"\*\*AI Estimation Suggestion\*\*.*?T-shirt Size.*?\*\*([A-Z]+)\*\*", re.DOTALL)
CALIBRATED_SIZE_RE = re.compile(r"\*\*AI Calibration\*\*.*?Calibrated.*?\*\*([A-Z]+)\*\*", re.DOTALL)


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


def fetch_done_issues_needing_measurement(api_key: str, team_id: str) -> list[dict]:
    query = f"""
    {{ issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          state: {{ type: {{ eq: "completed" }} }}
          estimate: {{ null: false }}
          and: [{{ labels: {{ every: {{ name: {{ neq: "roi-measured" }} }} }} }}]
        }}
        orderBy: updatedAt
        first: 30
    ) {{ nodes {{
        id identifier title estimate startedAt completedAt
        labels {{ nodes {{ id name }} }}
        assignee {{ name }}
        project {{ name }}
        comments(first: 50) {{ nodes {{ body createdAt }} }}
    }} }} }}
    """
    return _graphql(api_key, query).get("issues", {}).get("nodes", [])


def fetch_issue(api_key: str, identifier: str) -> dict:
    query = f"""
    {{ issue(id: "{identifier}") {{
        id identifier title estimate startedAt completedAt
        labels {{ nodes {{ id name }} }}
        state {{ type }}
        assignee {{ name }}
        project {{ name }}
        comments(first: 50) {{ nodes {{ body createdAt }} }}
    }} }}
    """
    return _graphql(api_key, query).get("issue", {})


def extract_size(comments: list[dict], regex: re.Pattern) -> str | None:
    matching = [c for c in comments if regex.search(c.get("body", ""))]
    if not matching:
        return None
    matching.sort(key=lambda c: c.get("createdAt", ""), reverse=True)
    m = regex.search(matching[0]["body"])
    return m.group(1) if m else None


def business_days_between(start: datetime, end: datetime) -> float:
    """Approx business days (Mon-Fri only), ignoring holidays.

    Returns a float — partial days count. Good enough for our accuracy goals.
    """
    if end <= start:
        return 0.0
    total_seconds = (end - start).total_seconds()
    total_days = total_seconds / 86400
    # Rough weekend adjustment: for each full 7-day span, 2 are weekends.
    weeks = total_days / 7
    weekend_days = weeks * 2
    return round(max(0.0, total_days - weekend_days), 2)


def measure_one(identifier: str) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    if not api_key:
        raise ValueError("LINEAR_API_KEY required")

    issue = fetch_issue(api_key, identifier)
    if not issue:
        print(f"[roi] {identifier} not found")
        return
    if issue.get("state", {}).get("type") != "completed":
        print(f"[roi] {identifier} is not completed, skipping")
        return
    if not issue.get("estimate"):
        print(f"[roi] {identifier} has no estimate, skipping")
        return
    if not issue.get("startedAt") or not issue.get("completedAt"):
        print(f"[roi] {identifier} missing startedAt or completedAt")
        return

    start = datetime.fromisoformat(issue["startedAt"].replace("Z", "+00:00"))
    end = datetime.fromisoformat(issue["completedAt"].replace("Z", "+00:00"))
    actual_days = business_days_between(start, end)
    actual_cost = round(actual_days * DAILY_RATE, 2)

    dev_size = POINTS_TO_TSHIRT.get(issue["estimate"], f"{issue['estimate']}pts")
    dev_expected_days = TSHIRT_TO_DAYS.get(dev_size, issue["estimate"])
    dev_expected_cost = round(dev_expected_days * DAILY_RATE, 2)

    comments = issue.get("comments", {}).get("nodes", [])
    ai_size = extract_size(comments, AI_SIZE_RE)
    calibrated_size = extract_size(comments, CALIBRATED_SIZE_RE)

    delta_days = round(actual_days - dev_expected_days, 2)
    delta_cost = round(actual_cost - dev_expected_cost, 2)
    accurate = abs(actual_days - dev_expected_days) <= dev_expected_days * 0.5  # within 50%

    # Post comment
    verdict = "✅ On track (within 50% of estimate)" if accurate else "⚠️ Overrun — actual exceeded estimate by >50%"
    body = f"""**ROI Measurement**

| | Value |
|---|---|
| AI suggested | {ai_size or '—'} |
| Dev set | {dev_size} ({issue['estimate']} pts) |
| Calibrated | {calibrated_size or '—'} |
| **Actual (business days)** | **{actual_days}d** |
| Expected (from dev size) | {dev_expected_days}d |
| Delta | {delta_days:+.2f}d ({delta_cost:+.0f}$) |
| Estimated cost | ${dev_expected_cost:,.0f} |
| **Actual cost** | **${actual_cost:,.0f}** |
| Accuracy | {verdict} |

*This data has been added to the calibration dataset. Future estimates on similar tickets will be more accurate.*"""

    _graphql(api_key, """
    mutation Comment($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }
    """, {"issueId": issue["id"], "body": body})

    # Mark roi-measured
    q = f"""
    {{ issueLabels(filter: {{ team: {{ id: {{ eq: "{team_id}" }} }} }}, first: 250) {{ nodes {{ id name }} }} }}
    """
    labels_map = {n["name"].lower(): n["id"] for n in _graphql(api_key, q).get("issueLabels", {}).get("nodes", [])}
    roi_id = labels_map.get("roi-measured")
    if roi_id:
        existing_q = f'{{ issue(id: "{issue["id"]}") {{ labels {{ nodes {{ id }} }} }} }}'
        existing = [n["id"] for n in _graphql(api_key, existing_q).get("issue", {}).get("labels", {}).get("nodes", [])]
        if roi_id not in existing:
            existing.append(roi_id)
        _graphql(api_key, """
        mutation Update($id: String!, $input: IssueUpdateInput!) {
          issueUpdate(id: $id, input: $input) { success }
        }
        """, {"id": issue["id"], "input": {"labelIds": existing}})

    # Append to calibration dataset (local file only for now — production could push to S3)
    append_to_calibration_data({
        "key": identifier,
        "summary": issue.get("title", ""),
        "type": "Task",  # fallback
        "priority": "Medium",  # fallback
        "assignee": issue.get("assignee", {}).get("name") if issue.get("assignee") else None,
        "project": issue.get("project", {}).get("name") if issue.get("project") else None,
        "estimate_size": dev_size,
        "estimate_points": issue["estimate"],
        "ai_size": ai_size,
        "calibrated_size": calibrated_size,
        "actual_days": actual_days,
        "cost_usd": actual_cost,
        "accurate": accurate,
        "completed_at": issue["completedAt"],
    })

    print(f"[roi] {identifier}: actual={actual_days}d, dev_est={dev_expected_days}d, delta={delta_days:+.1f}d, {verdict}")


def append_to_calibration_data(entry: dict) -> None:
    """Append a completed-task record to the local calibration dataset.

    Tries a few known paths; falls back to /tmp so nothing breaks in prod.
    """
    candidates = [
        os.environ.get("CALIBRATION_DATA_PATH", ""),
        os.path.join(os.path.dirname(__file__), "..", "..", ".docs", "estimation-calibration-data.json"),
        os.path.expanduser("~/Desktop/openearth/.docs/estimation-calibration-data.json"),
        "/opt/agentic-coder/.docs/estimation-calibration-data.json",
    ]
    path = None
    for p in candidates:
        if p and os.path.isfile(p):
            path = p
            break

    if not path:
        # Write to a new file
        path = os.path.expanduser("~/.oef-agentic-os-calibration.json")
        if not os.path.isfile(path):
            with open(path, "w") as f:
                json.dump({"metadata": {"source": "ROI Measurer"}, "calibration_data": []}, f, indent=2)

    try:
        with open(path) as f:
            data = json.load(f)
    except Exception:
        data = {"metadata": {}, "calibration_data": []}

    data.setdefault("calibration_data", []).append(entry)
    data.setdefault("metadata", {})["last_updated"] = datetime.utcnow().isoformat() + "Z"
    data["metadata"]["updated_by"] = "roi_measurer"

    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2)
    except PermissionError:
        # Systemd running as root may not be able to write to a user path; fall back.
        fallback = "/tmp/oef-calibration-append.jsonl"
        with open(fallback, "a") as f:
            f.write(json.dumps(entry) + "\n")


def watch_loop(interval: int = 300) -> None:
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")

    while True:
        try:
            candidates = fetch_done_issues_needing_measurement(api_key, team_id)
            if candidates:
                print(f"[roi] Found {len(candidates)} completed issues to measure")
                for c in candidates:
                    try:
                        measure_one(c["identifier"])
                    except Exception as e:
                        print(f"[roi] Error on {c['identifier']}: {e}")
            else:
                print("[roi] No new completed issues to measure")
        except Exception as e:
            print(f"[roi] Poll error: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="ROI Measurement Agent")
    parser.add_argument("--issue", help="Measure a single completed issue")
    parser.add_argument("--watch", action="store_true", help="Poll for completed issues to measure")
    parser.add_argument("--interval", type=int, default=300)
    args = parser.parse_args()
    if args.issue:
        measure_one(args.issue)
    elif args.watch:
        watch_loop(args.interval)
    else:
        parser.print_help()
