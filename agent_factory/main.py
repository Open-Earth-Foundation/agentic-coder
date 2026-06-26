"""CLI entry point for the agent factory."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from rich.console import Console
from rich.panel import Panel

from .agent import run_agent
from .adapters.base import TaskAdapter
from .adapters.markdown import MarkdownAdapter
from .config import Config
from .preflight import run_preflight, PreflightError

console = Console()


def _build_adapter(args: argparse.Namespace) -> TaskAdapter:
    """Build the right adapter based on CLI args."""
    source = getattr(args, "source", "markdown")

    if source == "jira":
        from .adapters.jira import JiraAdapter
        return JiraAdapter(
            label=getattr(args, "label", None) or "agent-ready",
        )
    elif source == "notion":
        from .adapters.notion import NotionAdapter
        return NotionAdapter()
    elif source == "linear":
        from .adapters.linear import LinearAdapter
        return LinearAdapter(
            label=getattr(args, "label", None) or "agent-ready",
        )
    else:
        return MarkdownAdapter(args.tasks_file)


def _print_report() -> None:
    """Read all session logs and print a summary."""
    import re
    log_dir = Path(__file__).parent.parent / "logs"
    if not log_dir.is_dir():
        console.print("[yellow]No logs directory found.[/yellow]")
        return

    log_files = sorted(log_dir.glob("*.md"))
    if not log_files:
        console.print("[yellow]No session logs found.[/yellow]")
        return

    total_tasks = len(log_files)
    pr_urls: list[str] = []
    total_cost = 0.0

    for lf in log_files:
        text = lf.read_text()
        pr_match = re.search(r"\*\*PR:\*\*\s*(https://github\.com/\S+/pull/\d+)", text)
        if pr_match:
            pr_urls.append(pr_match.group(1))
        cost_match = re.search(r"Est\. cost: \$([0-9.]+)", text)
        if cost_match:
            total_cost += float(cost_match.group(1))

    success_rate = (len(pr_urls) / total_tasks * 100) if total_tasks else 0

    console.print(Panel("[bold]Agent Report[/bold]", style="blue"))
    console.print(f"  Total tasks run:  {total_tasks}")
    console.print(f"  PRs created:      {len(pr_urls)}")
    console.print(f"  Success rate:     {success_rate:.0f}%")
    console.print(f"  Total est. cost:  ${total_cost:.4f}")

    if pr_urls:
        console.print(f"\n  [bold]Recent PRs:[/bold]")
        for url in pr_urls[-10:]:
            console.print(f"    {url}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Agent Factory — autonomous coding agent.",
    )
    sub = parser.add_subparsers(dest="source", help="Task source")

    # --- markdown (default) ---
    md_parser = sub.add_parser("markdown", aliases=["md"], help="Read tasks from a markdown file")
    md_parser.add_argument("tasks_file", help="Path to markdown file with ## task headings.")
    md_parser.add_argument("--task", type=int, help="Run only the Nth task (1-indexed).")

    # --- jira ---
    jira_parser = sub.add_parser("jira", help="Fetch tasks from Jira (set JIRA_* in .env)")
    jira_parser.add_argument("--label", default="agent-ready", help="Jira label to filter issues.")

    # --- notion ---
    sub.add_parser("notion", help="Fetch tasks from Notion database (set NOTION_* in .env)")

    # --- linear ---
    linear_parser = sub.add_parser("linear", help="Fetch tasks from Linear (set LINEAR_* in .env)")
    linear_parser.add_argument("--label", default="agent-ready", help="Linear label to filter issues.")

    # --- report ---
    sub.add_parser("report", help="Print a summary of all session logs (tasks, success rate, cost)")

    # --- scan ---
    scan_parser = sub.add_parser("scan", help="Scan repo for improvements and fix them")
    scan_parser.add_argument("--max-tasks", type=int, default=3, help="Max improvements to fix per run.")

    # --- watch ---
    watch_parser = sub.add_parser("watch", help="Poll a source for tasks continuously")
    watch_parser.add_argument("watch_source", choices=["jira", "notion", "linear"], help="Which source to poll.")
    watch_parser.add_argument("--interval", type=int, default=120, help="Poll interval in seconds.")
    watch_parser.add_argument("--no-scan", action="store_true", help="Disable repo scanning when idle.")

    # --- global options ---
    for p in [parser, md_parser, jira_parser, linear_parser, scan_parser, watch_parser]:
        p.add_argument("--repo", default=None, help="Path to git repo (or REPO_PATH in .env).")
        p.add_argument("--api-key", help="Anthropic API key (or ANTHROPIC_API_KEY in .env).")
        p.add_argument("--model", default=None, help="Anthropic model to use.")
        p.add_argument("--base-branch", default=None, help="Base branch for new branches.")
        p.add_argument("--branch-prefix", default=None, help="Prefix for branch names.")
        p.add_argument("--max-turns", type=int, default=None, help="Max agent turns per task.")
        p.add_argument("--dry-run", action="store_true", help="Don't write files or commands.")

    args = parser.parse_args()

    # Handle backward compat: if no subcommand, treat first arg as tasks_file
    if not args.source:
        if len(sys.argv) > 1 and not sys.argv[1].startswith("-"):
            args.source = "markdown"
            args.tasks_file = sys.argv[1]
            remaining = sys.argv[2:]
            ns = parser.parse_args(["markdown", args.tasks_file] + remaining)
            for k, v in vars(ns).items():
                setattr(args, k, v)
        else:
            parser.print_help()
            sys.exit(0)

    if args.source == "report":
        _print_report()
        sys.exit(0)

    config_kwargs: dict = {}
    if args.api_key:
        config_kwargs["anthropic_api_key"] = args.api_key
    if args.model:
        config_kwargs["model"] = args.model
    if args.branch_prefix:
        config_kwargs["branch_prefix"] = args.branch_prefix
    if args.base_branch:
        config_kwargs["base_branch"] = args.base_branch
    if args.max_turns:
        config_kwargs["max_agent_turns"] = args.max_turns
    if args.dry_run:
        config_kwargs["dry_run"] = True

    config = Config(**config_kwargs)

    try:
        config.validate()
    except ValueError as e:
        console.print(f"[red]Configuration error:[/red] {e}")
        sys.exit(1)

    repo_arg = getattr(args, "repo", None) or config.repo_path
    if not repo_arg:
        console.print("[red]Error:[/red] --repo is required (or set REPO_PATH in .env).")
        sys.exit(1)

    repo_root = str(Path(repo_arg).resolve())
    if not (Path(repo_root) / ".git").exists():
        console.print(f"[red]Error:[/red] {repo_root} is not a git repository.")
        sys.exit(1)

    # Pre-flight checks (skip for dry-run)
    if not config.dry_run:
        try:
            run_preflight(repo_root, config.base_branch)
        except PreflightError as e:
            console.print(f"[red]{e}[/red]")
            sys.exit(1)

    # Handle scan mode
    if args.source == "scan":
        from .scanner import scan_repo
        max_tasks = getattr(args, "max_tasks", 3)
        tasks = scan_repo(repo_root, max_tasks=max_tasks)
        if not tasks:
            console.print("[yellow]Repo scan found nothing actionable.[/yellow]")
            sys.exit(0)
        console.print(Panel(
            f"[bold]Repo Scan[/bold]\n"
            f"Found {len(tasks)} improvement(s) | Repo: {repo_root}",
            style="yellow",
        ))
        for i, task in enumerate(tasks, 1):
            console.print(f"  {i}. [{task.task_type}] {task.title}")
            summary, pr_url = run_agent(task, config, repo_root)
            if pr_url:
                console.print(f"  [green]PR: {pr_url}[/green]")
        console.print(Panel("[bold green]Scan complete[/bold green]", style="green"))
        sys.exit(0)

    # Handle watch mode
    if args.source == "watch":
        from .watcher import watch_loop
        watch_source = getattr(args, "watch_source", "jira")
        interval = getattr(args, "interval", 120)
        no_scan = getattr(args, "no_scan", False)

        if watch_source == "jira":
            from .adapters.jira import JiraAdapter
            adapter = JiraAdapter()
        else:
            from .adapters.notion import NotionAdapter
            adapter = NotionAdapter()

        watch_loop(
            adapter=adapter,
            config=config,
            repo_root=repo_root,
            poll_interval=interval,
            scan_when_idle=not no_scan,
        )
        sys.exit(0)

    try:
        adapter = _build_adapter(args)
    except ValueError as e:
        console.print(f"[red]Adapter error:[/red] {e}")
        sys.exit(1)

    tasks = adapter.fetch_tasks()
    if not tasks:
        console.print("[yellow]No tasks found.[/yellow]")
        sys.exit(0)

    task_filter = getattr(args, "task", None)
    if task_filter:
        idx = task_filter - 1
        if idx < 0 or idx >= len(tasks):
            console.print(f"[red]Error:[/red] task {task_filter} not found (have {len(tasks)} tasks).")
            sys.exit(1)
        tasks = [tasks[idx]]

    console.print(
        Panel(
            f"[bold]Agent Factory[/bold]\n"
            f"Source: {args.source} | Tasks: {len(tasks)} | Repo: {repo_root}\n"
            f"Model: {config.model} | Base: {config.base_branch} | Dry run: {config.dry_run}",
            style="blue",
        )
    )

    results: list[tuple[str, str, str | None]] = []

    for i, task in enumerate(tasks, 1):
        console.print(f"\n{'='*60}")
        console.print(f"[bold cyan]Task {i}/{len(tasks)}: {task.title}[/bold cyan]")
        console.print(f"{'='*60}")

        adapter.on_task_started(task)
        summary, pr_url = run_agent(task, config, repo_root)
        adapter.on_task_completed(task, summary, pr_url)
        results.append((task.title, summary, pr_url))

    console.print(f"\n{'='*60}")
    console.print(Panel("[bold green]All tasks processed[/bold green]", style="green"))

    for title, summary, pr_url in results:
        console.print(f"\n[bold]{title}[/bold]")
        if pr_url:
            console.print(f"  [green]PR: {pr_url}[/green]")
        preview = summary[:200] + ("..." if len(summary) > 200 else "")
        console.print(f"  [dim]{preview}[/dim]")


if __name__ == "__main__":
    main()
