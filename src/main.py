"""Application entry point for DesignCampaign."""

import logging
import os
import sys

# Configure QtWebEngine for WSL2/Wayland compatibility
# Use software WebGL rendering to avoid Vulkan issues while keeping WebGL working
# Must be set before importing Qt
os.environ.setdefault(
    "QTWEBENGINE_CHROMIUM_FLAGS",
    "--disable-gpu-compositing --use-gl=angle --use-angle=swiftshader"
)

from PyQt6.QtWidgets import QApplication

from src.ui.main_window import MainWindow


def configure_logging(debug: bool = False) -> None:
    """Configure logging for the application.

    Args:
        debug: If True, enable DEBUG level logging for troubleshooting.
    """
    level = logging.DEBUG if debug else logging.WARNING
    format_str = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"

    logging.basicConfig(
        level=level,
        format=format_str,
        handlers=[
            logging.StreamHandler(sys.stdout)
        ]
    )

    if debug:
        logging.info("Debug logging enabled")


def main():
    """Run the DesignCampaign application."""
    # Check for debug flag
    debug_mode = "--debug" in sys.argv
    if debug_mode:
        sys.argv.remove("--debug")

    # Configure logging
    configure_logging(debug=debug_mode)

    # Additional fallback for software rendering if needed
    if "--software-rendering" in sys.argv:
        os.environ["QT_QUICK_BACKEND"] = "software"
        sys.argv.remove("--software-rendering")

    app = QApplication(sys.argv)

    # Set application metadata
    app.setApplicationName("DesignCampaign")
    app.setApplicationVersion("0.1.0")
    app.setOrganizationName("DesignCampaign")

    # Create and show main window
    window = MainWindow()
    window.show()

    # Run event loop
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
