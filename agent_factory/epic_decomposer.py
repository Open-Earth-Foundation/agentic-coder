"""AI Epic Decomposer — proposes draft tickets from a confirmed Linear epic.

Reads a confirmed epic (parent issue with no sub-issues yet, or with the
`needs-decomposition` label), uses Claude to propose 3-15 draft tickets based
on the epic description, user stories, acceptance criteria, and codebase
context, then creates them as sub-issues in Linear with state="Triage" and
label "ai-proposed" for product team review.

Usage:
    python -m agent_factory.epic_decomposer --epic CC-336
    python -m agent_factory.epic_decomposer --watch    # poll for new epics
"""

from __future__ import annotations

import json
import os
import time
import urllib.request
from dataclasses import dataclass

from .config import Config

GRAPHQL_URL = "https://api.linear.app/graphql"

SYSTEM_PROMPT = """You are an AI ticket proposer for Open Earth Foundation's engineering team.

Given a Linear epic (parent issue) with its description, user stories, and acceptance criteria, you propose a draft list of tickets (sub-issues) that, together, would deliver the epic.

Rules:
1. Propose 3-15 tickets (more for L/XL epics, fewer for M).
2. Each ticket must be small enough to fit in 1-3 days (M or L size at most).
3. If something feels too big (XL), split it into 2-3 tickets.
4. Cover the full scope: design → backend → frontend → tests → docs → release where applicable.
5. Prefer vertical slices that ship value over horizontal layers.
6. Title format: verb + noun (e.g., "Add PDF export endpoint to inventory API").
7. Include for each ticket: title, description (3-5 lines), type (feature/bugfix/task/research/infra/docs), and area (frontend/backend/api/data/ai/infra).

Respond ONLY with valid JSON, no preamble:
{
  "tickets": [
    {
      "title": "...",
      "description": "...",
      "type": "feature|bugfix|task|research|infra|docs",
      "area": "frontend|backend|api|data|ai|infra"
    }
  ],
  "rationale": "Brief explanation of the decomposition approach (1-2 sentences)"
}
"""

TYPE_TO_LABEL = {
    "feature": "Feature",
    "bugfix": "Bugfix",
    "task": None,
    "research": "Research",
    "infra": "Infra",
    "docs": "Docs",
}

AREA_TO_LABEL = {
    "frontend": "Frontend",
    "backend": "Backend",
    "api": "Global API",
    "data": "Data Pipeline",
    "ai": "AI/ML",
    "infra": "Infrastructure",
}


@dataclass
class ProposedTicket:
    title: str
    description: str
    type: str
    area: str


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


def fetch_epic(api_key: str, epic_identifier: str) -> dict:
    """Fetch an epic by identifier (e.g., CC-336)."""
    query = f"""
    {{
      issue(id: "{epic_identifier}") {{
        id identifier title description
        team {{ id }}
        project {{ id name description }}
        labels {{ nodes {{ name }} }}
        children {{ nodes {{ id identifier title }} }}
      }}
    }}
    """
    data = _graphql(api_key, query)
    return data.get("issue", {})


def fetch_epics_needing_decomposition(api_key: str, team_id: str) -> list[dict]:
    """Find work that needs to be decomposed. Two supported forms (in order of preference):

    1. Project-as-Epic (Linear-native, RECOMMENDED)
       Projects carrying the `needs-decomposition` label. Decomposed issues are
       created linked to the Project (via projectId).

    2. Issue-as-Epic (legacy, lightweight)
       Issues carrying the `needs-decomposition` label with no sub-issues yet.
       Decomposed issues are created as sub-issues (via parentId).

    Returns a list of dicts with a `kind` field: "project" or "issue".
    """
    results: list[dict] = []

    # 1. Fetch Projects with the label
    project_query = f"""
    {{
      projects(
        filter: {{
          accessibleTeams: {{ some: {{ id: {{ eq: "{team_id}" }} }} }}
          labels: {{ some: {{ name: {{ eq: "needs-decomposition" }} }} }}
          state: {{ nin: ["completed", "canceled"] }}
        }}
        first: 10
      ) {{
        nodes {{
          id name description
          initiatives {{ nodes {{ name }} }}
          issues(first: 1) {{ nodes {{ id }} }}
        }}
      }}
    }}
    """
    try:
        data = _graphql(api_key, project_query)
        for p in data.get("projects", {}).get("nodes", []):
            # Only decompose empty Projects (no issues yet)
            if p.get("issues", {}).get("nodes"):
                continue
            initiative = None
            inits = p.get("initiatives", {}).get("nodes", [])
            if inits:
                initiative = inits[0]["name"]
            results.append({
                "kind": "project",
                "id": p["id"],
                "identifier": None,
                "title": p["name"],
                "description": p.get("description") or "",
                "project": {"id": p["id"], "name": p["name"], "description": p.get("description")},
                "initiative": initiative,
            })
    except Exception as e:
        print(f"[decomposer] project query failed (may be unsupported filter): {e}")

    # 2. Legacy Issue-as-Epic fallback
    issue_query = f"""
    {{
      issues(
        filter: {{
          team: {{ id: {{ eq: "{team_id}" }} }}
          labels: {{ name: {{ eq: "needs-decomposition" }} }}
          state: {{ type: {{ nin: ["completed", "canceled"] }} }}
        }}
        first: 10
      ) {{
        nodes {{
          id identifier title description
          project {{ id name description }}
          children {{ nodes {{ id }} }}
        }}
      }}
    }}
    """
    data = _graphql(api_key, issue_query)
    for issue in data.get("issues", {}).get("nodes", []):
        if issue.get("children", {}).get("nodes"):
            continue
        results.append({
            "kind": "issue",
            "id": issue["id"],
            "identifier": issue["identifier"],
            "title": issue["title"],
            "description": issue.get("description") or "",
            "project": issue.get("project"),
        })

    return results


def decompose(epic: dict, config: Config) -> tuple[list[ProposedTicket], str]:
    """Use Claude to propose tickets for this epic."""
    project_ctx = ""
    if epic.get("project"):
        proj = epic["project"]
        project_ctx = f"\nInitiative: {proj.get('name', 'Unknown')}"
        if proj.get("description"):
            project_ctx += f"\nInitiative description: {proj['description'][:500]}"

    user_message = f"""Decompose this epic into draft tickets:

**Epic Title:** {epic.get('title', 'Untitled')}
**Epic Description:**
{epic.get('description') or '(no description provided)'}
{project_ctx}

Propose 3-15 well-scoped tickets. Each should fit in 1-3 days. Respond with JSON only.
"""

    model = os.environ.get("DECOMPOSER_MODEL", "claude-haiku-4-5-20251001")
    payload = {
        "model": model,
        "max_tokens": 3000,
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

    tickets = [ProposedTicket(**t) for t in parsed["tickets"]]
    return tickets, parsed.get("rationale", "")


def create_proposed_tickets(api_key: str, team_id: str, epic: dict, tickets: list[ProposedTicket]) -> list[str]:
    """Create the proposed tickets in Linear with Triage state.

    - For Project-as-Epic (`kind: "project"`): issues are linked to the project via projectId.
    - For Issue-as-Epic (`kind: "issue"`): issues are created as sub-issues via parentId.

    Each ticket gets:
    - Label `ai-proposed` — audit trail (this ticket came from the AI)
    - Label `ready-for-quality` — kicks off the next agent in the pipeline
    - Any inferred type/area labels
    """
    created_ids = []
    kind = epic.get("kind", "issue")
    epic_id = epic["id"]
    parent_label = epic.get("identifier") or epic.get("title", "Project")

    for t in tickets:
        # `ready-for-quality` is the signal to the Quality Gate agent to pick this up next
        labels = ["ai-proposed", "ready-for-quality"]
        type_label = TYPE_TO_LABEL.get(t.type)
        if type_label:
            labels.append(type_label)
        area_label = AREA_TO_LABEL.get(t.area)
        if area_label:
            labels.append(area_label)

        parent_ref = f"Project: {epic['title']}" if kind == "project" else f"Parent issue: {parent_label}"
        description = f"""{t.description}

---

**Proposed by AI Epic Decomposer** — review, modify, or remove before sprint planning.

- {parent_ref}
- Type: {t.type}
- Area: {t.area}
"""

        label_ids = _resolve_label_ids(api_key, team_id, labels)
        triage_state_id = _resolve_state_id(api_key, team_id, "Triage")

        input_payload: dict = {
            "title": t.title,
            "description": description,
            "teamId": team_id,
            "labelIds": label_ids,
        }
        if kind == "project":
            input_payload["projectId"] = epic_id
        else:
            input_payload["parentId"] = epic_id
        if triage_state_id:
            input_payload["stateId"] = triage_state_id

        mutation = """
        mutation Create($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier title }
          }
        }
        """
        result = _graphql(api_key, mutation, {"input": input_payload})
        created = result.get("issueCreate", {}).get("issue", {})
        if created:
            created_ids.append(created.get("identifier", "?"))

    return created_ids


def _resolve_state_id(api_key: str, team_id: str, state_name: str) -> str | None:
    """Find state ID by name in a team. Fallback: try common alternatives."""
    query = f"""
    {{ workflowStates(filter: {{ team: {{ id: {{ eq: "{team_id}" }} }} }}) {{ nodes {{ id name }} }} }}
    """
    data = _graphql(api_key, query)
    nodes = data.get("workflowStates", {}).get("nodes", [])
    # Try exact, then case-insensitive, then "Backlog" as fallback
    for s in nodes:
        if s["name"] == state_name:
            return s["id"]
    for s in nodes:
        if s["name"].lower() == state_name.lower():
            return s["id"]
    for s in nodes:
        if "backlog" in s["name"].lower():
            return s["id"]
    return None


def _resolve_label_ids(api_key: str, team_id: str, label_names: list[str]) -> list[str]:
    """Resolve label names to IDs. Auto-create 'ai-proposed' if it doesn't exist."""
    query = f"""
    {{ issueLabels(filter: {{ team: {{ id: {{ eq: "{team_id}" }} }} }}, first: 250) {{ nodes {{ id name }} }} }}
    """
    data = _graphql(api_key, query)
    existing = {l["name"].lower(): l["id"] for l in data.get("issueLabels", {}).get("nodes", [])}

    ids = []
    for name in label_names:
        lower = name.lower()
        if lower in existing:
            ids.append(existing[lower])
        elif name == "ai-proposed":
            # Auto-create
            create_mut = """
            mutation Create($input: IssueLabelCreateInput!) {
              issueLabelCreate(input: $input) {
                success
                issueLabel { id }
              }
            }
            """
            result = _graphql(api_key, create_mut, {
                "input": {"name": "ai-proposed", "color": "#8B5CF6", "teamId": team_id}
            })
            new_id = result.get("issueLabelCreate", {}).get("issueLabel", {}).get("id")
            if new_id:
                ids.append(new_id)
    return ids


def post_summary_comment(api_key: str, epic: dict, tickets: list[ProposedTicket], created_ids: list[str], rationale: str) -> None:
    """Post a summary of the decomposition.

    - Issue-as-Epic: posts a Linear comment on the epic issue.
    - Project-as-Epic: creates a Project Update on the project (Linear's native mechanism for project-level updates).
    """
    lines = [f"**AI Epic Decomposer** proposed {len(tickets)} draft tickets:\n"]
    for i, (t, tid) in enumerate(zip(tickets, created_ids), 1):
        lines.append(f"{i}. [{tid}] {t.title} ({t.type}/{t.area})")
    lines.append(f"\n**Rationale:** {rationale}")
    lines.append("\n*Tickets created with `ai-proposed` + `ready-for-quality` labels, state `Triage`. The Quality Gate agent will refine them next, then AI Estimation will score them. Product team: review and curate before sprint planning.*")
    body = "\n".join(lines)

    if epic.get("kind") == "project":
        mutation = """
        mutation ProjectUpdate($input: ProjectUpdateCreateInput!) {
          projectUpdateCreate(input: $input) { success }
        }
        """
        try:
            _graphql(api_key, mutation, {"input": {"projectId": epic["id"], "body": body}})
        except Exception as e:
            print(f"[decomposer] project update failed, tickets still linked: {e}")
    else:
        mutation = """
        mutation Comment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) { success }
        }
        """
        _graphql(api_key, mutation, {"issueId": epic["id"], "body": body})


def remove_needs_decomposition_label(api_key: str, team_id: str, epic: dict) -> None:
    """Strip the needs-decomposition label so this epic isn't re-processed.

    Projects have their own label set (workspace-level project labels); issues
    have team-scoped issue labels.
    """
    if epic.get("kind") == "project":
        # Project labels: fetch current and rewrite without needs-decomposition
        proj_q = f'{{ project(id: "{epic["id"]}") {{ labels {{ nodes {{ id name }} }} }} }}'
        data = _graphql(api_key, proj_q)
        current = data.get("project", {}).get("labels", {}).get("nodes", [])
        remaining = [l["id"] for l in current if l["name"].lower() != "needs-decomposition"]

        mutation = """
        mutation ProjectUpdate($id: String!, $input: ProjectUpdateInput!) {
          projectUpdate(id: $id, input: $input) { success }
        }
        """
        _graphql(api_key, mutation, {"id": epic["id"], "input": {"labelIds": remaining}})
        return

    # Issue-as-Epic path
    label_q = f"""
    {{ issueLabels(filter: {{ name: {{ eq: "needs-decomposition" }}, team: {{ id: {{ eq: "{team_id}" }} }} }}) {{ nodes {{ id }} }} }}
    """
    data = _graphql(api_key, label_q)
    nodes = data.get("issueLabels", {}).get("nodes", [])
    if not nodes:
        return
    label_id = nodes[0]["id"]

    issue_q = f'{{ issue(id: "{epic["id"]}") {{ labels {{ nodes {{ id }} }} }} }}'
    issue_data = _graphql(api_key, issue_q)
    existing = [n["id"] for n in issue_data.get("issue", {}).get("labels", {}).get("nodes", []) if n["id"] != label_id]

    mutation = """
    mutation Update($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) { success }
    }
    """
    _graphql(api_key, mutation, {"id": epic["id"], "input": {"labelIds": existing}})


def decompose_one(epic_identifier: str) -> None:
    """End-to-end: fetch a single Issue epic by identifier, decompose, create sub-issues, post summary.

    NOTE: This entry point is Issue-as-Epic only. For Project-as-Epic, use the
    watch loop (which auto-detects both modes) or call `_decompose_epic_dict` directly.
    """
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    if not api_key or not team_id:
        raise ValueError("LINEAR_API_KEY and LINEAR_TEAM_ID required")

    epic = fetch_epic(api_key, epic_identifier)
    if not epic:
        print(f"[decomposer] Epic {epic_identifier} not found")
        return

    epic_dict = {
        "kind": "issue",
        "id": epic["id"],
        "identifier": epic["identifier"],
        "title": epic["title"],
        "description": epic.get("description") or "",
        "project": epic.get("project"),
    }
    _decompose_epic_dict(epic_dict, api_key, team_id)


def _decompose_epic_dict(epic: dict, api_key: str, team_id: str) -> None:
    """Actual decomposition worker — accepts a normalized epic dict."""
    config = Config()
    config.validate()

    label = epic.get("identifier") or f"Project '{epic.get('title')}'"
    print(f"[decomposer] Decomposing {label}: {epic['title']} (kind={epic.get('kind')})")

    tickets, rationale = decompose(epic, config)
    print(f"[decomposer] Got {len(tickets)} proposed tickets")
    for t in tickets:
        print(f"  - [{t.type}/{t.area}] {t.title}")

    created = create_proposed_tickets(api_key, team_id, epic, tickets)
    print(f"[decomposer] Created {len(created)} tickets: {created}")

    post_summary_comment(api_key, epic, tickets, created, rationale)
    print(f"[decomposer] Posted summary")

    try:
        remove_needs_decomposition_label(api_key, team_id, epic)
        print(f"[decomposer] Removed needs-decomposition label from {label}")
    except Exception as e:
        print(f"[decomposer] Warning: could not remove label from {label}: {e}")


def watch_loop(interval: int = 300) -> None:
    """Poll for Projects or Issues labeled `needs-decomposition` and decompose them."""
    api_key = os.environ.get("LINEAR_API_KEY", "")
    team_id = os.environ.get("LINEAR_TEAM_ID", "")
    config = Config()
    config.validate()

    while True:
        try:
            epics = fetch_epics_needing_decomposition(api_key, team_id)
            if epics:
                print(f"[decomposer] Found {len(epics)} candidates to decompose")
                for epic in epics:
                    label = epic.get("identifier") or f"Project '{epic.get('title')}'"
                    try:
                        _decompose_epic_dict(epic, api_key, team_id)
                    except Exception as e:
                        print(f"[decomposer] Error on {label}: {e}")
            else:
                print("[decomposer] No epics need decomposition")
        except Exception as e:
            print(f"[decomposer] Poll error: {e}")
        time.sleep(interval)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="AI Epic Decomposer")
    parser.add_argument("--epic", help="Decompose a single epic by identifier (e.g., CC-336)")
    parser.add_argument("--watch", action="store_true", help="Poll for epics labeled `needs-decomposition`")
    parser.add_argument("--interval", type=int, default=300, help="Poll interval in seconds")
    args = parser.parse_args()

    if args.epic:
        decompose_one(args.epic)
    elif args.watch:
        watch_loop(args.interval)
    else:
        parser.print_help()
