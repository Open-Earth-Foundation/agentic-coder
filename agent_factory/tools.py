"""Tools the agent can call — file I/O, search, and git operations."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

TOOL_DEFINITIONS = [
    {
        "name": "read_file",
        "description": "Read the full contents of a file. Returns the text with line numbers.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Path relative to the repo root."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_code",
        "description": "Search for a regex pattern across the codebase using ripgrep. Returns matching lines with file paths.",
        "input_schema": {
            "type": "object",
            "properties": {
                "pattern": {"type": "string", "description": "Regex pattern to search for."},
                "glob": {"type": "string", "description": "Optional file glob filter, e.g. '*.ts' or '*.py'."},
                "path": {"type": "string", "description": "Optional subdirectory to scope the search."},
            },
            "required": ["pattern"],
        },
    },
    {
        "name": "list_directory",
        "description": "List files and directories at the given path. Returns names with type indicators (dir/ or file).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Directory path relative to repo root. Use '.' for root."},
                "depth": {"type": "integer", "description": "Max depth to list. Default 1.", "default": 1},
            },
            "required": ["path"],
        },
    },
    {
        "name": "edit_file",
        "description": "Replace an exact string in a file with a new string. The old_string must match exactly (including whitespace). For new files, set old_string to empty.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "File path relative to repo root."},
                "old_string": {"type": "string", "description": "Exact text to find and replace. Empty string to create a new file."},
                "new_string": {"type": "string", "description": "Replacement text."},
            },
            "required": ["path", "old_string", "new_string"],
        },
    },
    {
        "name": "run_command",
        "description": "Run a shell command in the repo directory. Use for git operations, linting, testing, etc. Returns stdout and stderr.",
        "input_schema": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The shell command to execute."},
            },
            "required": ["command"],
        },
    },
]


def execute_tool(name: str, args: dict, repo_root: str) -> str:
    """Dispatch a tool call and return the result as a string."""
    root = Path(repo_root)

    if name == "read_file":
        return _read_file(root, args["path"])
    elif name == "search_code":
        return _search_code(root, args["pattern"], args.get("glob"), args.get("path"))
    elif name == "list_directory":
        return _list_directory(root, args["path"], args.get("depth", 1))
    elif name == "edit_file":
        return _edit_file(root, args["path"], args["old_string"], args["new_string"])
    elif name == "run_command":
        return _run_command(root, args["command"])
    else:
        return f"Error: unknown tool '{name}'"


def _read_file(root: Path, rel_path: str) -> str:
    target = root / rel_path
    if not target.is_file():
        return f"Error: file not found: {rel_path}"
    try:
        text = target.read_text(errors="replace")
        lines = text.splitlines()
        numbered = [f"{i + 1:>6}|{line}" for i, line in enumerate(lines)]
        return "\n".join(numbered)
    except Exception as e:
        return f"Error reading file: {e}"


def _search_code(root: Path, pattern: str, glob: str | None, path: str | None) -> str:
    cmd = ["rg", "--no-heading", "-n", "--max-count", "50", pattern]
    if glob:
        cmd.extend(["--glob", glob])
    search_path = str(root / path) if path else str(root)
    cmd.append(search_path)
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        output = result.stdout.strip()
        if not output:
            return "No matches found."
        return output[:10_000]
    except FileNotFoundError:
        cmd = [
            "grep", "-rn", "-E", "--max-count=50",
            "--exclude-dir=node_modules", "--exclude-dir=.next",
            "--exclude-dir=.git", "--exclude-dir=dist",
            pattern, search_path,
        ]
        if glob:
            for ext in glob.replace("*.", "").split(","):
                cmd.insert(3, f"--include=*.{ext.strip()}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.stdout.strip()[:10_000] or "No matches found."
    except Exception as e:
        return f"Error: {e}"


def _list_directory(root: Path, rel_path: str, depth: int) -> str:
    target = root / rel_path
    if not target.is_dir():
        return f"Error: directory not found: {rel_path}"
    entries = []
    try:
        for item in sorted(target.iterdir()):
            if item.name.startswith(".") and item.name not in (".github",):
                continue
            if item.name == "node_modules":
                continue
            suffix = "/" if item.is_dir() else ""
            entries.append(f"{item.name}{suffix}")
            if item.is_dir() and depth > 1:
                try:
                    for sub in sorted(item.iterdir()):
                        if sub.name.startswith("."):
                            continue
                        sub_suffix = "/" if sub.is_dir() else ""
                        entries.append(f"  {sub.name}{sub_suffix}")
                except PermissionError:
                    pass
    except Exception as e:
        return f"Error: {e}"
    return "\n".join(entries) or "(empty directory)"


def _edit_file(root: Path, rel_path: str, old_string: str, new_string: str) -> str:
    target = root / rel_path
    if old_string == "":
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(new_string)
        return f"Created new file: {rel_path}"
    if not target.is_file():
        return f"Error: file not found: {rel_path}"
    content = target.read_text()
    if old_string not in content:
        return f"Error: old_string not found in {rel_path}. Make sure it matches exactly."
    count = content.count(old_string)
    if count > 1:
        return f"Error: old_string appears {count} times in {rel_path}. Provide more context to make it unique."
    new_content = content.replace(old_string, new_string, 1)
    target.write_text(new_content)
    return f"Successfully edited {rel_path}"


def _run_command(root: Path, command: str) -> str:
    blocked = ["rm -rf /", "rm -rf ~", "push --force", "push -f"]
    if any(b in command for b in blocked):
        return "Error: this command is blocked for safety."
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            cwd=str(root),
            timeout=120,
            env={
                **{k: v for k, v in os.environ.items() if k != "GITHUB_TOKEN"},
                "GIT_TERMINAL_PROMPT": "0",
            },
        )
        output = ""
        if result.stdout:
            output += result.stdout
        if result.stderr:
            output += ("\n" if output else "") + result.stderr
        if result.returncode != 0:
            output += f"\n(exit code: {result.returncode})"
        return output.strip()[:10_000] or "(no output)"
    except subprocess.TimeoutExpired:
        return "Error: command timed out after 120 seconds."
    except Exception as e:
        return f"Error: {e}"
