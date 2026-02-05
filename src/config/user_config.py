"""User configuration persistence for DesignCampaign.

Handles saving and loading user preferences like metric filter ranges.
"""

import json
import logging
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# Configuration file path
CONFIG_DIR = Path.home() / ".config" / "designcampaign"
FILTERS_FILE = CONFIG_DIR / "filters.json"


@dataclass
class FilterConfig:
    """Configuration for metric filter ranges.

    Attributes:
        metric_ranges: Dict mapping metric names to (min, max) tuples.
            None values indicate no filter for that bound.
    """

    metric_ranges: dict[str, tuple[float | None, float | None]] = field(
        default_factory=dict
    )


def save_filters(config: FilterConfig) -> bool:
    """Save filter configuration to disk.

    Args:
        config: FilterConfig to save.

    Returns:
        True if saved successfully, False otherwise.
    """
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        # Convert to JSON-serializable format
        data = {
            "metric_ranges": {
                k: [v[0], v[1]]
                for k, v in config.metric_ranges.items()
            }
        }

        with open(FILTERS_FILE, "w") as f:
            json.dump(data, f, indent=2)

        logger.debug(f"Saved filter config to {FILTERS_FILE}")
        return True

    except Exception as e:
        logger.error(f"Failed to save filter config: {e}")
        return False


def load_filters() -> FilterConfig | None:
    """Load filter configuration from disk.

    Returns:
        FilterConfig if file exists and is valid, None otherwise.
    """
    if not FILTERS_FILE.exists():
        return None

    try:
        with open(FILTERS_FILE) as f:
            data = json.load(f)

        # Convert from JSON format back to tuples
        metric_ranges = {}
        for k, v in data.get("metric_ranges", {}).items():
            if isinstance(v, list) and len(v) == 2:
                metric_ranges[k] = (v[0], v[1])

        config = FilterConfig(metric_ranges=metric_ranges)
        logger.debug(f"Loaded filter config from {FILTERS_FILE}")
        return config

    except Exception as e:
        logger.error(f"Failed to load filter config: {e}")
        return None


def clear_filters() -> bool:
    """Clear saved filter configuration.

    Returns:
        True if cleared successfully (or didn't exist), False on error.
    """
    try:
        if FILTERS_FILE.exists():
            FILTERS_FILE.unlink()
            logger.debug(f"Cleared filter config at {FILTERS_FILE}")
        return True
    except Exception as e:
        logger.error(f"Failed to clear filter config: {e}")
        return False


@dataclass
class UserConfig:
    """Complete user configuration.

    Attributes:
        filters: Filter configuration.
        last_folder: Last opened folder path.
        window_geometry: Window position and size.
    """

    filters: FilterConfig = field(default_factory=FilterConfig)
    last_folder: str | None = None
    window_geometry: dict[str, int] | None = None


# Full config file for future expansion
FULL_CONFIG_FILE = CONFIG_DIR / "config.json"


def save_config(config: UserConfig) -> bool:
    """Save full user configuration.

    Args:
        config: UserConfig to save.

    Returns:
        True if saved successfully.
    """
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)

        data = {
            "filters": {
                "metric_ranges": {
                    k: [v[0], v[1]]
                    for k, v in config.filters.metric_ranges.items()
                }
            },
            "last_folder": config.last_folder,
            "window_geometry": config.window_geometry,
        }

        with open(FULL_CONFIG_FILE, "w") as f:
            json.dump(data, f, indent=2)

        return True

    except Exception as e:
        logger.error(f"Failed to save config: {e}")
        return False


def load_config() -> UserConfig:
    """Load full user configuration.

    Returns:
        UserConfig (with defaults if file doesn't exist).
    """
    if not FULL_CONFIG_FILE.exists():
        return UserConfig()

    try:
        with open(FULL_CONFIG_FILE) as f:
            data = json.load(f)

        # Parse filters
        filters_data = data.get("filters", {})
        metric_ranges = {}
        for k, v in filters_data.get("metric_ranges", {}).items():
            if isinstance(v, list) and len(v) == 2:
                metric_ranges[k] = (v[0], v[1])

        return UserConfig(
            filters=FilterConfig(metric_ranges=metric_ranges),
            last_folder=data.get("last_folder"),
            window_geometry=data.get("window_geometry"),
        )

    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return UserConfig()
