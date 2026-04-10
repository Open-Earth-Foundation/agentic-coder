"""Context injection — reads project rules, skills, and docs to enrich the agent prompt."""

from __future__ import annotations

from pathlib import Path


def gather_project_context(repo_root: str, max_chars: int = 12000) -> str:
    """Read project-specific context files and return a combined string for the system prompt."""
    root = Path(repo_root)
    sections: list[str] = []
    total = 0

    readme = _read_if_exists(root / "README.md", max_chars=2000)
    if readme:
        sections.append(f"## Project README (excerpt)\n\n{readme}")
        total += len(readme)

    rules = _collect_glob(root, ".cursor/rules/**/*.md", max_per_file=1500)
    rules += _collect_glob(root, ".cursor/rules/**/*.mdc", max_per_file=1500)
    if rules:
        combined = "\n\n---\n\n".join(rules)
        if total + len(combined) < max_chars:
            sections.append(f"## Project Rules (from .cursor/rules/)\n\n{combined}")
            total += len(combined)

    skills = _collect_glob(root, ".cursor/skills/**/SKILL.md", max_per_file=1500)
    if skills:
        combined = "\n\n---\n\n".join(skills)
        if total + len(combined) < max_chars:
            sections.append(f"## Project Skills (from .cursor/skills/)\n\n{combined}")
            total += len(combined)

    agents_md = _read_if_exists(root / "AGENTS.md", max_chars=2000)
    if agents_md:
        if total + len(agents_md) < max_chars:
            sections.append(f"## AGENTS.md\n\n{agents_md}")
            total += len(agents_md)

    contributing = _read_if_exists(root / "CONTRIBUTING.md", max_chars=1500)
    if contributing:
        if total + len(contributing) < max_chars:
            sections.append(f"## CONTRIBUTING.md\n\n{contributing}")

    if not sections:
        return ""

    header = (
        "# Project Context\n\n"
        "The following is context about this specific project. "
        "Follow these rules and conventions when making changes.\n\n"
    )
    return header + "\n\n".join(sections)


def _read_if_exists(path: Path, max_chars: int = 2000) -> str:
    if not path.is_file():
        return ""
    try:
        text = path.read_text(errors="replace")
        if len(text) > max_chars:
            text = text[:max_chars] + "\n\n... (truncated)"
        return text
    except Exception:
        return ""


def _collect_glob(root: Path, pattern: str, max_per_file: int = 1500) -> list[str]:
    results = []
    for path in sorted(root.glob(pattern)):
        try:
            text = path.read_text(errors="replace")
            rel = path.relative_to(root)
            if len(text) > max_per_file:
                text = text[:max_per_file] + "\n\n... (truncated)"
            results.append(f"### {rel}\n\n{text}")
        except Exception:
            continue
    return results
