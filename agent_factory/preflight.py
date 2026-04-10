"""Pre-flight checks — verify everything is ready before running the agent."""

from __future__ import annotations

import subprocess
from pathlib import Path

from rich.console import Console

console = Console()


class PreflightError(Exception):
    pass


def run_preflight(repo_root: str, base_branch: str) -> None:
    """Run all pre-flight checks. Raises PreflightError on failure."""
    root = Path(repo_root)
    checks = [
        ("Git repository exists", _check_git_repo, root),
        ("On base branch", _check_base_branch, root, base_branch),
        ("Working tree is clean", _check_clean_tree, root),
        ("gh CLI is authenticated", _check_gh_auth, root),
        ("Remote is reachable", _check_remote, root),
    ]

    console.print("[dim]Running pre-flight checks...[/dim]")
    all_passed = True

    for name, fn, *args in checks:
        try:
            fn(*args)
            console.print(f"  [green]✓[/green] {name}")
        except PreflightError as e:
            console.print(f"  [red]✗[/red] {name}: {e}")
            all_passed = False
        except Exception as e:
            console.print(f"  [yellow]?[/yellow] {name}: {e}")

    if not all_passed:
        raise PreflightError("Pre-flight checks failed. Fix the issues above before running.")

    console.print("[green]All pre-flight checks passed.[/green]\n")


def _check_git_repo(root: Path) -> None:
    if not (root / ".git").exists():
        raise PreflightError(f"{root} is not a git repository")


def _check_base_branch(root: Path, base_branch: str) -> None:
    result = subprocess.run(
        ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        capture_output=True, text=True, cwd=str(root),
    )
    current = result.stdout.strip()
    if current != base_branch:
        _switch = subprocess.run(
            ["git", "checkout", base_branch],
            capture_output=True, text=True, cwd=str(root),
        )
        if _switch.returncode != 0:
            raise PreflightError(
                f"On '{current}', failed to switch to '{base_branch}': {_switch.stderr.strip()}"
            )


def _check_clean_tree(root: Path) -> None:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        capture_output=True, text=True, cwd=str(root),
    )
    if result.stdout.strip():
        lines = result.stdout.strip().splitlines()
        raise PreflightError(
            f"{len(lines)} uncommitted change(s). Stash or commit them first."
        )


def _check_gh_auth(root: Path) -> None:
    import os
    env = {**{k: v for k, v in os.environ.items() if k != "GITHUB_TOKEN"}}
    result = subprocess.run(
        ["gh", "auth", "status"],
        capture_output=True, text=True, cwd=str(root), env=env,
    )
    if result.returncode != 0 and "Logged in" not in result.stdout + result.stderr:
        raise PreflightError("gh CLI not authenticated. Run: gh auth login")


def _check_remote(root: Path) -> None:
    result = subprocess.run(
        ["git", "ls-remote", "--exit-code", "origin", "HEAD"],
        capture_output=True, text=True, cwd=str(root), timeout=15,
    )
    if result.returncode != 0:
        raise PreflightError("Cannot reach remote 'origin'")
