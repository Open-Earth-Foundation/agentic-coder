# agentic-coder — Agent Brief

**Read this first.** This file applies whether you're an AI agent (Cursor, Cursor Cloud Agent, Claude Code, Codex) editing this repo, or a human contributor sending a PR.

`agentic-coder` is **the OEF autonomous-coder tool**. It reads tasks, edits a target codebase, and opens PRs. It is dog-food: anything we add here that improves our agents must also improve this repo's own development experience.

---

## What this repo is

A small Python CLI (`agent_factory/`) that:

1. Loads tasks from a source (`markdown`, `jira`, `notion`).
2. Runs Claude with a tool-use loop and 5 tools (`read_file`, `search_code`, `list_directory`, `edit_file`, `run_command`).
3. Implements + tests + self-reviews + opens a PR via `gh`.
4. Tracks token usage and per-task cost.
5. Optionally polls (`watch`) and auto-scans the target repo (`scan`).

Default model: `claude-sonnet-4-20250514`. Default base branch on the **target** repo: `develop`. Branch prefix on the target: `agentic-coder/`.

## Repo layout

```
agentic-coder/
├── AGENTS.md                    # this file (the agent contract)
├── CLAUDE.md                    # extra context for Claude Code (mirror of AGENTS.md essentials)
├── README.md                    # human-facing overview
├── run.sh                       # CLI wrapper
├── .env / .env.example          # config (Anthropic key, REPO_PATH, branch prefix, …)
├── requirements.txt
├── agent_factory/               # core package
│   ├── main.py                  # CLI entry (markdown / jira / notion / scan / watch)
│   ├── agent.py                 # agentic loop, cost tracking, PR URL extraction
│   ├── config.py                # .env loading + Config dataclass
│   ├── context.py               # injects target-repo AGENTS.md / .cursor/rules / skills
│   ├── tools.py                 # 5 tool definitions + execute_tool
│   ├── scanner.py               # autonomous repo scanner (TODO / console.log / as any / empty catch)
│   ├── watcher.py               # continuous polling + idle scan
│   ├── preflight.py             # git / gh / clean tree / remote checks
│   ├── task_parser.py           # Task dataclass + markdown parser
│   └── adapters/                # markdown / jira / notion task sources
├── tasks/                       # markdown task backlogs
│   ├── getting-started.md
│   └── citycatalyst-stability.md
├── profiles/                    # per-target-repo defaults (NEW)
│   ├── citycatalyst.yaml
│   ├── global-data.yaml
│   └── agentic-coder.yaml
├── prompts/                     # system-prompt scaffolds (NEW)
│   └── system-base.md
├── docs/                        # operator docs (NEW)
│   ├── PLAYBOOK.md              # how to run overnight / cloud / scan
│   └── EXTENDING.md             # how to add adapter / tool / scanner rule
└── logs/                        # session logs (gitignored)
```

---

## What you must NOT do

- **Do not open a PR against this repo unless explicitly told** in the active task. Push the branch and stop; a human reviews and opens it.
- **Do not merge your own PR if you are an agent.** Humans merge.
- **Do not commit secrets** — `.env`, Anthropic keys, Jira tokens, Notion tokens.
- **Do not break the public CLI surface** (`./run.sh markdown|jira|notion|scan|watch [...]`). It's contracted by team scripts.
- **Do not silently change the default model or `max_agent_turns`.** These have cost implications.
- **Do not depend on libraries beyond the minimal set** (`anthropic`, `python-dotenv`, optional `requests` for adapters). Keep `requirements.txt` boring.
- **Do not modify `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `.cursor/skills/`, `prompts/`, or `profiles/` without core-team review.** These are the agentic foundation, curated by the core engineering team. (Code merges in `agent_factory/` are unaffected — any tech-team member can merge after standard review.)

## What you must always do

- Branch off `main`, follow Conventional Commits.
- Update `README.md` and `docs/PLAYBOOK.md` when CLI / behaviour changes.
- Keep parity between `.env.example` and `Config` defaults.
- Write a smoke test for any new adapter / tool / scanner rule (see `docs/EXTENDING.md`).
- Use the `commit-message-standards` and `pull-request-standards` skills.

---

## Where to find what

### Operating the tool

- **Run overnight against CityCatalyst:** `docs/PLAYBOOK.md` → "Watch mode (Jira)".
- **Run a one-off task:** `./run.sh task <N>` after editing `tasks/<file>.md`.
- **Run the scanner:** `./run.sh scan` (idle scan also runs in `watch` after 5 idle cycles).
- **Inspect logs:** `./run.sh logs` (last 20 markdown sessions in `logs/`).

### Extending the tool

- **Adding a new task source (Linear, GitHub Issues, …):** `docs/EXTENDING.md` → "Add an adapter".
- **Adding a new tool (e.g. `git_diff`, `mcp_call`):** `docs/EXTENDING.md` → "Add a tool".
- **Adding a new scanner rule:** `docs/EXTENDING.md` → "Add a scanner category".
- **Adding a per-repo profile:** drop a YAML in `profiles/<repo>.yaml` and pass `--profile <repo>` to the CLI.

### Skills

| Want to | Use |
|---------|-----|
| Write a commit message for this repo | `.cursor/skills/commit-message-standards/SKILL.md` |
| Open / draft a PR for this repo | `.cursor/skills/pull-request-standards/SKILL.md` |

### Rules

| Topic | Open |
|-------|------|
| General code taste | `.cursor/rules/general.mdc` |
| Repo architecture | `.cursor/rules/project-architecture.mdc` |
| Branches, commits, PRs | `.cursor/rules/git-conventions.mdc` |
| Security baseline (secrets, shell, gh) | `.cursor/rules/security-baseline.mdc` |
| OS / shell defaults | `.cursor/rules/os-shell.mdc` |
| Anthropic / tool-use | `.cursor/rules/anthropic-tool-use.mdc` |
| Adapters | `.cursor/rules/adapters.mdc` |

---

## Quickstart (humans)

```bash
git clone git@github.com:Open-Earth-Foundation/agentic-coder.git
cd agentic-coder
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env       # fill ANTHROPIC_API_KEY, REPO_PATH, etc.

./run.sh list              # see available tasks
./run.sh task 1            # run task 1 against the target repo
```

The full playbook (overnight + Cloud Agents + scanner) lives in `docs/PLAYBOOK.md`.
