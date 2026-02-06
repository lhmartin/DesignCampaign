"""Application settings and constants."""

from pathlib import Path
from dataclasses import dataclass

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


@dataclass
class Theme:
    """Color theme definition."""

    name: str
    # Main window colors
    background: str
    foreground: str
    secondary_background: str
    border: str
    # Plot colors
    plot_background: str
    plot_foreground: str
    plot_grid: str
    # Table colors
    table_alternate_row: str
    table_header_background: str
    # Accent colors
    accent: str
    accent_hover: str
    # Text colors
    text_primary: str
    text_secondary: str
    text_disabled: str
    # 3D viewer background
    viewer_background: str


LIGHT_THEME = Theme(
    name="light",
    background="#ffffff",
    foreground="#000000",
    secondary_background="#f5f5f5",
    border="#cccccc",
    plot_background="#ffffff",
    plot_foreground="#000000",
    plot_grid="#e0e0e0",
    table_alternate_row="#f8f8f8",
    table_header_background="#e8e8e8",
    accent="#0078d4",
    accent_hover="#106ebe",
    text_primary="#000000",
    text_secondary="#666666",
    text_disabled="#999999",
    viewer_background="white",
)

DARK_THEME = Theme(
    name="dark",
    background="#1e1e1e",
    foreground="#d4d4d4",
    secondary_background="#252526",
    border="#3c3c3c",
    plot_background="#252526",
    plot_foreground="#d4d4d4",
    plot_grid="#3c3c3c",
    table_alternate_row="#2d2d2d",
    table_header_background="#333333",
    accent="#0078d4",
    accent_hover="#1c97ea",
    text_primary="#d4d4d4",
    text_secondary="#9d9d9d",
    text_disabled="#6d6d6d",
    viewer_background="#1e1e1e",
)

THEMES = {
    "light": LIGHT_THEME,
    "dark": DARK_THEME,
}

DEFAULT_THEME = "light"
