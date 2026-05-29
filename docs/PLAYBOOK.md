# agentic-coder — Operator Playbook

How to actually run this thing in anger. For users (CTO, engineers), not for contributors.

---

## 0 — One-time setup

```bash
git clone git@github.com:Open-Earth-Foundation/agentic-coder.git
cd agentic-coder
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

# fill in:
#   ANTHROPIC_API_KEY=sk-ant-...
#   REPO_PATH=../CityCatalyst                (or wherever the target repo is)
#   BRANCH_PREFIX=agentic-coder
#   BASE_BRANCH=develop

gh auth login                                # required
```

Verify:

```bash
./run.sh list                                # should print tasks
```

---

## 1 — Run a single task (smoke)

Pick something tiny from `tasks/getting-started.md`:

```bash
./run.sh task 1
```

You'll see the agent: explore → plan → edit → test → push → PR. Watch the cost line at the end.

---

## 2 — Burn the backlog (markdown source)

Curate a backlog file (e.g. `tasks/citycatalyst-stability.md`):

```bash
TASKS_FILE=tasks/citycatalyst-stability.md ./run.sh all
```

Each `## ` heading becomes one PR.

---

## 3 — Overnight (Jira source)

Best mode for "queue-and-go-to-sleep":

```bash
./run.sh watch jira
```

What happens:

- Polls Jira every **2 minutes** for issues with the label `agent-ready` (configurable via `JIRA_AGENT_LABEL`).
- For each issue: transitions to "In Progress", runs the loop, opens PR, comments PR link, leaves the issue for human review.
- After **5 idle cycles** (~10 minutes), runs an **idle scan** of the target repo (TODO / `console.log` / `as any` / empty `catch`) and processes one cleanup PR.
- `Ctrl+C` to stop.

> Tip: run inside `tmux` or `screen` so a closed terminal doesn't kill it.

---

## 4 — Overnight (Notion source)

Same shape as Jira:

```bash
./run.sh watch notion
```

Looks for pages with `Status` = "Agent Ready" in the database referenced by `NOTION_DATABASE_ID`.

---

## 5 — Autonomous repo scan (no source)

When the inbox is empty but you want forward motion:

```bash
./run.sh scan
```

Surfaces aggregated TODO / `console.log` / `as any` / empty-catch hits and proposes one cleanup PR per category that has ≥ 2 hits.

---

## 6 — Cursor Cloud Agents kickoff (alternative)

For tasks too small for `agentic-coder` but too big for in-IDE Cursor, use Cursor Cloud Agents from `CityCatalyst/.cursor/cloud/<flow>.md`. The Cloud Agent reads the same `AGENTS.md` and `.cursor/rules/`, so the result is consistent with overnight runs.

---

## 7 — Inspect runs

Every task writes a markdown log to `agentic-coder/logs/`:

```bash
./run.sh logs                 # last 20 logs
ls -lt logs/ | head -20

cat logs/<file>.md            # full transcript + cost + PR URL
```

---

## 8 — Cost / budget

- The default model is Sonnet — cost rates hardcoded at $3/M input, $15/M output.
- Per-task cost is printed at the end and stored in the log.
- For `watch` mode, watch the cumulative cost across logs (`grep "Est. cost" logs/*.md`).
- Soft budget rails live in `profiles/<repo>.yaml`. The CLI doesn't enforce them yet — see `tasks/self-improvement.md`.

---

## 9 — Common errors

| Error | Fix |
|-------|-----|
| `gh auth status` fails | `gh auth login` — make sure the OEF SSO is granted. |
| `working tree not clean` | `git stash` or `git status` to inspect. The agent refuses to start dirty. |
| `not on base branch` | `git checkout develop` (or whatever `BASE_BRANCH` is). The agent will also try, but fail loudly if it can't. |
| `no tasks found` | Check `JIRA_AGENT_LABEL`, `NOTION_DATABASE_ID`, or your tasks markdown headings. |
| `model returned no tool calls and not end_turn` | Often a prompt issue or rate-limit. Re-run; if persistent, dial `max_agent_turns` lower and split the task. |

---

## 10 — Safety

- The agent **does not merge** and does not open PRs unless told. PRs land on a branch; a human reviews and merges (any tech-team member, after standard review).
- `run_command` has a small blocklist — see `agent_factory/tools.py`. Don't shrink it.
- Any new mutating tool must respect `Config.dry_run`.
- Cost tracking is informational, not enforcing — keep an eye on it for autonomous runs.
