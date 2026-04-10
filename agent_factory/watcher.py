"""Watch mode — polls a task source periodically and runs the agent on new tasks."""

from __future__ import annotations

import time

from rich.console import Console
from rich.panel import Panel

from .adapters.base import TaskAdapter
from .agent import run_agent
from .config import Config
from .scanner import scan_repo

console = Console()


def watch_loop(
    adapter: TaskAdapter,
    config: Config,
    repo_root: str,
    poll_interval: int = 120,
    scan_when_idle: bool = True,
    max_scan_tasks: int = 3,
) -> None:
    """Continuously poll for tasks, run them, and optionally scan when idle.

    This is the 'sleep and wake up to work' loop from the agentic factory concept.
    """
    console.print(
        Panel(
            f"[bold]Watch Mode[/bold]\n"
            f"Polling every {poll_interval}s | Scan when idle: {scan_when_idle}\n"
            f"Repo: {repo_root} | Model: {config.model}",
            style="magenta",
        )
    )

    idle_cycles = 0

    while True:
        try:
            console.print(f"\n[dim][{_now()}] Polling for tasks...[/dim]")
            tasks = adapter.fetch_tasks()

            if tasks:
                idle_cycles = 0
                console.print(f"[green]Found {len(tasks)} task(s). Starting...[/green]")

                for i, task in enumerate(tasks, 1):
                    console.print(f"\n{'='*60}")
                    console.print(f"[bold cyan]Task {i}/{len(tasks)}: {task.title}[/bold cyan]")
                    console.print(f"{'='*60}")

                    adapter.on_task_started(task)
                    try:
                        summary, pr_url = run_agent(task, config, repo_root)
                        adapter.on_task_completed(task, summary, pr_url)
                        if pr_url:
                            console.print(f"[green]PR created: {pr_url}[/green]")
                    except Exception as e:
                        console.print(f"[red]Task failed: {e}[/red]")
                        adapter.on_task_completed(task, f"Failed: {e}", None)

            else:
                idle_cycles += 1
                console.print(f"[dim]No tasks found. Idle cycle {idle_cycles}.[/dim]")

                if scan_when_idle and idle_cycles % 5 == 0:
                    console.print(f"\n[yellow]Running repo scan (idle for {idle_cycles} cycles)...[/yellow]")
                    scan_tasks = scan_repo(repo_root, max_tasks=max_scan_tasks)

                    if scan_tasks:
                        console.print(f"[yellow]Found {len(scan_tasks)} improvement(s) from scan.[/yellow]")
                        for task in scan_tasks[:1]:
                            console.print(f"\n{'='*60}")
                            console.print(f"[bold yellow]Scan: {task.title}[/bold yellow]")
                            console.print(f"{'='*60}")
                            try:
                                summary, pr_url = run_agent(task, config, repo_root)
                                if pr_url:
                                    console.print(f"[green]Scan PR: {pr_url}[/green]")
                            except Exception as e:
                                console.print(f"[red]Scan task failed: {e}[/red]")
                    else:
                        console.print("[dim]Repo scan found nothing actionable.[/dim]")

            console.print(f"[dim]Sleeping {poll_interval}s...[/dim]")
            time.sleep(poll_interval)

        except KeyboardInterrupt:
            console.print("\n[yellow]Watch mode stopped.[/yellow]")
            break
        except Exception as e:
            console.print(f"[red]Watch loop error: {e}. Retrying in {poll_interval}s...[/red]")
            time.sleep(poll_interval)


def _now() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")
