"""Application settings and constants."""

from pathlib import Path

# Supported file formats
SUPPORTED_FORMATS = [".pdb", ".cif"]

# Default window dimensions
DEFAULT_WINDOW_WIDTH = 1200
DEFAULT_WINDOW_HEIGHT = 800

# Panel proportions (left panel percentage)
LEFT_PANEL_RATIO = 0.25

# Viewer settings
DEFAULT_VIEWER_STYLE = "cartoon"
DEFAULT_BACKGROUND_COLOR = "white"

# File size limits (in bytes)
MAX_FILE_SIZE_WARNING = 100 * 1024 * 1024  # 100MB

# Application info
APP_NAME = "DesignCampaign"
APP_VERSION = "0.1.0"
