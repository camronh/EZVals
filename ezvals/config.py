"""Config file management for ezvals."""

import json
from pathlib import Path
from typing import Optional

CONFIG_FILENAME = "ezvals.json"

DEFAULT_CONFIG = {
    "concurrency": 1,
    "results_dir": ".",
    "overwrite": True,
    "completion_notifications": False,
}


def get_config_path() -> Path:
    """Returns path to config file in current working directory."""
    return Path.cwd() / CONFIG_FILENAME


def load_config() -> dict:
    """Load config from file. Creates default config if not found."""
    path = get_config_path()
    if not path.exists():
        save_config(DEFAULT_CONFIG)
        return DEFAULT_CONFIG.copy()

    with open(path) as f:
        return json.load(f)


def save_config(config: dict) -> None:
    """Save config to file."""
    path = get_config_path()
    with open(path, "w") as f:
        json.dump(config, f, indent=2)


def resolve_run_config(config_name: Optional[str]) -> dict:
    """Resolve a named config profile from ezvals.json. Returns {} if no name given."""
    if not config_name:
        return {}
    config = load_config()
    configs = config.get("configs", {})
    if config_name not in configs:
        available = ", ".join(sorted(configs.keys())) if configs else "(none defined)"
        raise ValueError(
            f"Config '{config_name}' not found in ezvals.json. Available: {available}"
        )
    return configs[config_name]


def resolve_sessions_dir(config: dict) -> str:
    """Resolve the concrete sessions storage dir from config's base directory."""
    return str(Path(config.get("results_dir", ".")) / ".ezvals" / "sessions")
