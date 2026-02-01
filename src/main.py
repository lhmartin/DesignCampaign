"""Application entry point for DesignCampaign."""

import sys

from PyQt6.QtWidgets import QApplication

from src.ui.main_window import MainWindow


def main():
    """Run the DesignCampaign application."""
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
