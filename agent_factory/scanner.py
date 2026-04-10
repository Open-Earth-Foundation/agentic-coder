"""Repo scanner — finds improvement opportunities autonomously."""

from __future__ import annotations

import subprocess
from pathlib import Path

from .task_parser import Task


SCAN_CATEGORIES = [
    {
        "name": "TODO/FIXME/HACK comments",
        "pattern": r"(TODO|FIXME|HACK|XXX)",
        "glob": "*.{ts,tsx,js,jsx,py}",
        "task_type": "cleanup",
        "description_template": "Address {count} TODO/FIXME/HACK comments found in the codebase. "
            "Review each one and either implement the fix or remove the comment if it's no longer relevant.",
    },
    {
        "name": "console.log in production code",
        "pattern": r"console\.(log|warn|error)\(",
        "glob": "*.{tsx,ts}",
        "exclude_glob": "*.{test,spec,jest}.*",
        "task_type": "cleanup",
        "description_template": "Remove {count} debug console.log/warn/error statements from production UI code. "
            "Do NOT remove them from test files, backend services using a proper logger, or error boundaries.",
    },
    {
        "name": "'as any' type assertions",
        "pattern": r"\bas any\b",
        "glob": "*.{ts,tsx}",
        "task_type": "improvement",
        "description_template": "Replace {count} 'as any' type assertions with proper types. "
            "Each one masks a potential runtime type mismatch.",
    },
    {
        "name": "Missing error handling (empty catch)",
        "pattern": r"catch\s*\([^)]*\)\s*\{\s*\}",
        "glob": "*.{ts,tsx,js}",
        "task_type": "bugfix",
        "description_template": "Fix {count} empty catch blocks that silently swallow errors. "
            "Add proper error logging or re-throw as appropriate.",
    },
]


def scan_repo(repo_root: str, max_tasks: int = 5) -> list[Task]:
    """Scan the repo for improvement opportunities and return them as Tasks."""
    root = Path(repo_root)
    tasks: list[Task] = []

    for category in SCAN_CATEGORIES:
        if len(tasks) >= max_tasks:
            break

        hits = _search(root, category["pattern"], category.get("glob"))
        if not hits:
            continue

        file_groups = _group_by_file(hits)
        count = sum(file_groups.values())

        if count < 2:
            continue

        top_files = sorted(file_groups.items(), key=lambda x: -x[1])[:5]
        files_list = [f for f, _ in top_files]

        file_summary = "\n".join(
            f"- `{f}` ({n} occurrences)" for f, n in top_files
        )

        task = Task(
            title=f"Clean up: {category['name']}",
            task_type=category["task_type"],
            description=(
                category["description_template"].format(count=count)
                + f"\n\nTop files:\n{file_summary}"
            ),
            files=files_list,
        )
        tasks.append(task)

    return tasks


def _search(root: Path, pattern: str, glob: str | None) -> list[str]:
    try:
        cmd = ["rg", "--no-heading", "-c", pattern]
        if glob:
            cmd.extend(["--glob", glob])
        cmd.extend([
            "--glob", "!node_modules",
            "--glob", "!.next",
            "--glob", "!dist",
            "--glob", "!*.test.*",
            "--glob", "!*.spec.*",
            "--glob", "!*.jest.*",
            "--glob", "!__tests__",
            str(root),
        ])
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.stdout.strip():
            return result.stdout.strip().splitlines()
    except FileNotFoundError:
        pass
    except Exception:
        return []

    try:
        include_flags = []
        if glob:
            for ext in glob.replace("*.{", "").replace("}", "").split(","):
                include_flags.extend(["--include", f"*.{ext.strip()}"])
        cmd = [
            "grep", "-r", "-c", "-E", pattern,
            "--exclude-dir=node_modules",
            "--exclude-dir=.next",
            "--exclude-dir=dist",
            "--exclude-dir=__tests__",
            *include_flags,
            str(root),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        lines = [l for l in result.stdout.strip().splitlines() if not l.endswith(":0")]
        return lines
    except Exception:
        return []


def _group_by_file(hits: list[str]) -> dict[str, int]:
    groups: dict[str, int] = {}
    for line in hits:
        parts = line.rsplit(":", 1)
        if len(parts) == 2:
            filepath, count_str = parts
            try:
                groups[filepath] = int(count_str)
            except ValueError:
                groups[filepath] = 1
    return groups
