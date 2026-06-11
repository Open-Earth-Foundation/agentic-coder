import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv() -> None:
    """Load .env file from the agent-factory directory if it exists."""
    env_path = Path(__file__).parent.parent / ".env"
    if not env_path.is_file():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key, value = key.strip(), value.strip()
        if key and not os.environ.get(key):
            os.environ[key] = value


_load_dotenv()


@dataclass
class Config:
    anthropic_api_key: str = field(default_factory=lambda: os.environ.get("ANTHROPIC_API_KEY", ""))
    model: str = "claude-sonnet-4-20250514"
    max_agent_turns: int = 50
    branch_prefix: str = field(default_factory=lambda: os.environ.get("BRANCH_PREFIX", "agent"))
    base_branch: str = field(default_factory=lambda: os.environ.get("BASE_BRANCH", "develop"))
    repo_path: str = field(default_factory=lambda: os.environ.get("REPO_PATH", ""))
    auto_commit: bool = True
    dry_run: bool = False
    enable_evaluator: bool = True

    def validate(self) -> None:
        if not self.anthropic_api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY not set. Add it to .env or pass via --api-key."
            )
