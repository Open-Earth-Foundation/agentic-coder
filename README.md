# Agentic Coder

An autonomous software engineering agent that reads tasks, implements them in your codebase, writes tests, validates its work, and opens pull requests — while you sleep.

> Give it a backlog. Wake up to PRs.

## What it does

Agentic Coder connects to your task source (markdown files, Jira, or Notion), picks up tasks, and for each one:

1. **Explores** the codebase to understand the relevant code
2. **Plans** the approach (visible in the terminal output)
3. **Implements** the changes with minimal, precise edits
4. **Tests** — runs existing tests, writes new ones when appropriate
5. **Validates** — runs linters and type checkers, fixes any errors it introduced
6. **Self-reviews** — checks its own `git diff` before committing
7. **Ships** — creates a branch, commits, pushes, and opens a PR with a full description

If tests fail, it iterates up to 3 times to fix the issue.

```
[Task Source]                    [Agent Pipeline]                 [Output]

  Markdown (.md)  ─┐              1. Explore codebase             Branch
  Jira API        ─┼─→ Adapter → 2. Plan approach    → Claude →  Commit
  Notion API      ─┘              3. Implement          (tool    Push
                                  4. Test                use)    PR on GitHub
                                  5. Validate                    Session log
                                  6. Self-review
                                  7. Ship
```

## Quick start

```bash
git clone https://github.com/Open-Earth-Foundation/agentic-coder.git
cd agentic-coder
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add your Anthropic API key
```

Edit `.env` with your configuration, then:

```bash
./run.sh list                          # see available tasks
./run.sh task 1                        # run task 1 → creates PR
./run.sh all                           # run all tasks
```

## Usage

### Markdown tasks (default)

Write tasks in a markdown file under `tasks/`, then run them:

```bash
./run.sh list                                  # list tasks
./run.sh task 1                                # run one task
./run.sh all                                   # run all tasks
./run.sh dry                                   # dry run (no changes)
TASKS_FILE=tasks/my-sprint.md ./run.sh all     # use a different file
```

### Jira

Connect to your Jira board and let the agent pick up labeled issues:

```bash
# Add JIRA_* credentials to .env, then:
./run.sh jira
```

The agent will fetch issues labeled `agent-ready`, move them to "In Progress", implement the fix, open a PR, and post the PR link as a comment on the Jira issue.

### Notion

Same idea, but from a Notion database:

```bash
# Add NOTION_* credentials to .env, then:
./run.sh notion
```

### Autonomous scan

Let the agent find and fix issues on its own:

```bash
./run.sh scan
```

It scans the repo for TODO/FIXME comments, leftover `console.log` statements, `as any` type assertions, and empty catch blocks — then generates tasks and fixes them.

### Watch mode (continuous)

The "assign tasks and go to sleep" mode:

```bash
./run.sh watch jira     # poll Jira every 2 minutes
./run.sh watch notion   # poll Notion every 2 minutes
```

When tasks are found, it processes them. When idle for 5 cycles, it runs a repo scan and fixes what it finds. `Ctrl+C` to stop.

### Session logs

Every completed task is logged to `logs/` with the full summary, PR URL, and cost:

```bash
./run.sh logs
```

## Task file format

Tasks live in `tasks/*.md`. Each `##` heading is a task:

```markdown
## Fix the login performance issue

- **type**: bugfix
- **description**: Remove the unnecessary User.findAll() call in auth.ts
- **files**: app/src/lib/auth.ts

### Acceptance criteria

- The findAll() call is removed
- Login still works correctly
```

Supported fields:

| Field | Required | Description |
|-------|----------|-------------|
| `## Title` | Yes | Used to generate branch names |
| `**type**` | No | `bugfix`, `feature`, `improvement`, `cleanup` |
| `**description**` | No | What needs to be done |
| `**files**` | No | Comma-separated list of relevant files |
| `### Acceptance criteria` | No | Bullet list of requirements the agent will verify |

## How it works under the hood

### Agent tools

The agent has 5 tools it can call during its loop:

| Tool | What it does |
|------|-------------|
| `read_file` | Read any file in the repo (with line numbers) |
| `search_code` | Regex search across the codebase (via ripgrep) |
| `list_directory` | Explore the repo structure |
| `edit_file` | Precise string replacement in files |
| `run_command` | Git operations, linting, testing, type checking |

### Context injection

The agent automatically reads project-specific context from the repo:

- `README.md` — understands the project
- `.cursor/rules/*.md` — follows team conventions
- `.cursor/skills/*/SKILL.md` — knows project patterns
- `AGENTS.md`, `CONTRIBUTING.md` — follows contribution guidelines

This context is injected into the system prompt so the agent writes code that fits the project's style.

### Adapters

Each task source has an adapter that handles the full lifecycle:

| Adapter | Fetch tasks | On start | On complete |
|---------|------------|----------|-------------|
| Markdown | Parses `## ` headings | — | — |
| Jira | Queries by label | Moves to "In Progress" | Posts PR link as comment |
| Notion | Queries by status | Sets "In Progress" | Sets "Done" + adds comment |

### Pre-flight checks

Before running, the agent verifies:

- Git repo exists and is on the correct base branch
- Working tree is clean (no uncommitted changes)
- `gh` CLI is authenticated
- Remote repository is reachable

### Cost tracking

Each task shows token usage and estimated cost:

```
API calls: 17 | Tokens: 93,432 in / 2,877 out | Est. cost: $0.32
```

Costs are also saved in session logs.

## Configuration

All configuration lives in `.env`:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
REPO_PATH=../your-repo
BRANCH_PREFIX=agentic-coder
BASE_BRANCH=develop

# Jira (optional)
JIRA_DOMAIN=yourcompany.atlassian.net
JIRA_EMAIL=you@company.com
JIRA_API_TOKEN=your-token
JIRA_PROJECT=CC
JIRA_AGENT_LABEL=agent-ready

# Notion (optional)
NOTION_API_KEY=secret_...
NOTION_DATABASE_ID=your-database-id
```

## Project structure

```
agentic-coder/
├── AGENTS.md                     # Agent brief (read first)
├── CLAUDE.md                     # Extra context for Claude Code
├── run.sh                        # CLI wrapper
├── .env / .env.example           # Configuration
├── .cursor/
│   ├── rules/                    # Cursor rules (general, architecture, security, …)
│   └── skills/                   # Named workflows (commit-message-standards, pull-request-standards)
├── profiles/                     # Per-target-repo defaults (citycatalyst, global-data, agentic-coder)
├── prompts/
│   └── system-base.md            # Reference for the live system prompt
├── tasks/                        # Markdown task backlogs
│   ├── getting-started.md
│   ├── citycatalyst-stability.md
│   ├── global-data-cleanup.md
│   └── self-improvement.md
├── docs/
│   ├── PLAYBOOK.md               # How to operate (overnight, watch, scan)
│   └── EXTENDING.md              # How to add adapters, tools, scanner rules
├── logs/                         # Session logs (gitignored)
└── agent_factory/                # Core package
    ├── main.py                   # CLI entry point
    ├── agent.py                  # Agentic loop + cost tracking
    ├── config.py                 # .env loading + config
    ├── context.py                # Project context injection
    ├── scanner.py                # Autonomous repo scanner
    ├── watcher.py                # Continuous polling loop
    ├── preflight.py              # Pre-flight checks
    ├── task_parser.py            # Task dataclass + markdown parser
    ├── tools.py                  # 5 agent tools
    └── adapters/
        ├── base.py               # TaskAdapter interface
        ├── markdown.py           # Markdown file adapter
        ├── jira.py               # Jira REST API adapter
        └── notion.py             # Notion API adapter
```

## Roadmap

### Done

- [x] Agentic loop with Claude tool use (read, search, edit, run commands)
- [x] Markdown task parsing
- [x] Git workflow automation (branch, commit, push, PR via `gh`)
- [x] Jira adapter with full lifecycle (fetch, status update, PR comment)
- [x] Notion adapter with full lifecycle
- [x] Autonomous repo scanner (TODOs, console.log, `as any`, empty catch)
- [x] Watch mode (continuous polling + idle scanning)
- [x] Project context injection (rules, skills, README)
- [x] Pre-flight checks (git, gh auth, clean tree, remote)
- [x] Cost tracking (tokens + USD per task)
- [x] Session logging
- [x] Testing loop (run existing tests, write new ones)
- [x] Self-validation (linter, type checker, self-review)

### Next

- [ ] Multi-repo support (run across multiple repositories)
- [ ] Linear adapter
- [ ] GitHub Issues adapter (fetch issues labeled `agent-ready`)
- [ ] Slack notifications (post PR links to a channel)
- [ ] Configurable LLM (OpenAI, local models via Ollama)
- [ ] Parallel task execution
- [ ] Web dashboard for monitoring runs and costs
- [ ] MCP server integration for richer tool use
- [ ] Custom scanner rules (configurable patterns per project)

## Documentation map

- **[`AGENTS.md`](AGENTS.md)** — agent brief; read first if you're an AI agent or new contributor.
- **[`CLAUDE.md`](CLAUDE.md)** — extra context for Claude Code-style sessions.
- **[`docs/PLAYBOOK.md`](docs/PLAYBOOK.md)** — operator guide: overnight runs, watch mode, scan, Cloud Agents.
- **[`docs/EXTENDING.md`](docs/EXTENDING.md)** — how to add adapters, tools, scanner rules, profiles.
- **[`profiles/`](profiles/)** — per-target-repo defaults (CityCatalyst, global-data, agentic-coder).
- **[`prompts/system-base.md`](prompts/system-base.md)** — reference for the live system prompt.
- **[`tasks/`](tasks/)** — curated task backlogs (citycatalyst-stability, global-data-cleanup, self-improvement).

## Why this exists

Most AI coding tools are either:

- **Too generic** — they don't know your project's conventions, rules, or architecture
- **Too closed** — you can't control the prompt, tools, or workflow
- **Too manual** — you still have to babysit every step

Agentic Coder is **yours to own and customize**. It reads your project's rules, follows your conventions, and you control every aspect of how it works. It's the difference between hiring a generic contractor and having a team member who knows the codebase.

## License

AGPL-3.0 — see [LICENSE](LICENSE).
