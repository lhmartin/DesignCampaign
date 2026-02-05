"""Theme manager for applying light/dark modes across the application."""

from typing import Callable
from PyQt6.QtWidgets import QApplication

from src.config.settings import Theme, THEMES, DEFAULT_THEME


class ThemeManager:
    """Manages application theming and notifies listeners on theme changes.

    Uses callbacks instead of Qt signals to avoid QObject initialization issues.
    """

    _instance = None

    def __new__(cls):
        """Singleton pattern to ensure one theme manager."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._current_theme_name = DEFAULT_THEME
        self._current_theme = THEMES[DEFAULT_THEME]
        self._listeners: list[Callable[[Theme], None]] = []
        self._initialized = True

    @property
    def current_theme(self) -> Theme:
        """Get the current theme."""
        return self._current_theme

    @property
    def current_theme_name(self) -> str:
        """Get the current theme name."""
        return self._current_theme_name

    @property
    def is_dark_mode(self) -> bool:
        """Check if dark mode is active."""
        return self._current_theme_name == "dark"

    def add_listener(self, callback: Callable[[Theme], None]) -> None:
        """Add a listener for theme changes.

        Args:
            callback: Function to call when theme changes, receives Theme object.
        """
        if callback not in self._listeners:
            self._listeners.append(callback)

    def remove_listener(self, callback: Callable[[Theme], None]) -> None:
        """Remove a theme change listener.

        Args:
            callback: Previously registered callback.
        """
        if callback in self._listeners:
            self._listeners.remove(callback)

    def set_theme(self, theme_name: str) -> None:
        """Set the application theme.

        Args:
            theme_name: Name of the theme ('light' or 'dark').
        """
        if theme_name not in THEMES:
            raise ValueError(f"Unknown theme: {theme_name}")

        if theme_name == self._current_theme_name:
            return

        self._current_theme_name = theme_name
        self._current_theme = THEMES[theme_name]
        self._apply_stylesheet()
        self._notify_listeners()

    def toggle_dark_mode(self) -> None:
        """Toggle between light and dark mode."""
        new_theme = "dark" if self._current_theme_name == "light" else "light"
        self.set_theme(new_theme)

    def _notify_listeners(self) -> None:
        """Notify all listeners of theme change."""
        for callback in self._listeners:
            try:
                callback(self._current_theme)
            except Exception:
                pass  # Don't let one bad listener break others

    def _apply_stylesheet(self) -> None:
        """Apply the current theme's stylesheet to the application."""
        app = QApplication.instance()
        if app:
            app.setStyleSheet(self.get_stylesheet())

    def get_stylesheet(self) -> str:
        """Generate the Qt stylesheet for the current theme.

        Returns:
            CSS-like stylesheet string.
        """
        t = self._current_theme
        return f"""
            /* Main Window */
            QMainWindow, QDialog {{
                background-color: {t.background};
                color: {t.text_primary};
            }}

            /* General Widgets */
            QWidget {{
                background-color: {t.background};
                color: {t.text_primary};
            }}

            /* Group Boxes */
            QGroupBox {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                border-radius: 4px;
                margin-top: 8px;
                padding-top: 8px;
            }}
            QGroupBox::title {{
                subcontrol-origin: margin;
                left: 8px;
                padding: 0 4px;
                color: {t.text_primary};
            }}

            /* Buttons */
            QPushButton {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                border-radius: 4px;
                padding: 6px 12px;
                color: {t.text_primary};
            }}
            QPushButton:hover {{
                background-color: {t.accent};
                color: white;
            }}
            QPushButton:pressed {{
                background-color: {t.accent_hover};
            }}
            QPushButton:disabled {{
                background-color: {t.secondary_background};
                color: {t.text_disabled};
            }}

            /* Line Edit */
            QLineEdit {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                border-radius: 4px;
                padding: 4px 8px;
                color: {t.text_primary};
            }}
            QLineEdit:focus {{
                border-color: {t.accent};
            }}

            /* Combo Box */
            QComboBox {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                border-radius: 4px;
                padding: 4px 8px;
                color: {t.text_primary};
            }}
            QComboBox:hover {{
                border-color: {t.accent};
            }}
            QComboBox::drop-down {{
                border: none;
                width: 20px;
            }}
            QComboBox QAbstractItemView {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                color: {t.text_primary};
                selection-background-color: {t.accent};
                selection-color: white;
            }}

            /* Spin Box */
            QSpinBox, QDoubleSpinBox {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                border-radius: 4px;
                padding: 4px;
                color: {t.text_primary};
            }}

            /* Check Box */
            QCheckBox {{
                color: {t.text_primary};
                spacing: 8px;
            }}
            QCheckBox::indicator {{
                width: 16px;
                height: 16px;
                border: 1px solid {t.border};
                border-radius: 3px;
                background-color: {t.secondary_background};
            }}
            QCheckBox::indicator:checked {{
                background-color: {t.accent};
                border-color: {t.accent};
            }}

            /* Labels */
            QLabel {{
                color: {t.text_primary};
                background-color: transparent;
            }}

            /* Tab Widget */
            QTabWidget::pane {{
                border: 1px solid {t.border};
                background-color: {t.background};
            }}
            QTabBar::tab {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                border-bottom: none;
                padding: 8px 16px;
                color: {t.text_primary};
            }}
            QTabBar::tab:selected {{
                background-color: {t.background};
                border-bottom: 2px solid {t.accent};
            }}
            QTabBar::tab:hover:!selected {{
                background-color: {t.table_alternate_row};
            }}

            /* Table View */
            QTableView {{
                background-color: {t.background};
                alternate-background-color: {t.table_alternate_row};
                border: 1px solid {t.border};
                gridline-color: {t.border};
                color: {t.text_primary};
            }}
            QTableView::item:selected {{
                background-color: {t.accent};
                color: white;
            }}
            QHeaderView::section {{
                background-color: {t.table_header_background};
                border: none;
                border-right: 1px solid {t.border};
                border-bottom: 1px solid {t.border};
                padding: 6px;
                color: {t.text_primary};
            }}

            /* Scroll Bars */
            QScrollBar:vertical {{
                background-color: {t.secondary_background};
                width: 12px;
                border: none;
            }}
            QScrollBar::handle:vertical {{
                background-color: {t.border};
                border-radius: 4px;
                min-height: 20px;
                margin: 2px;
            }}
            QScrollBar::handle:vertical:hover {{
                background-color: {t.text_secondary};
            }}
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {{
                height: 0;
            }}
            QScrollBar:horizontal {{
                background-color: {t.secondary_background};
                height: 12px;
                border: none;
            }}
            QScrollBar::handle:horizontal {{
                background-color: {t.border};
                border-radius: 4px;
                min-width: 20px;
                margin: 2px;
            }}
            QScrollBar::handle:horizontal:hover {{
                background-color: {t.text_secondary};
            }}
            QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal {{
                width: 0;
            }}

            /* Splitter - larger handles for easier dragging */
            QSplitter::handle {{
                background-color: {t.border};
                border-radius: 3px;
            }}
            QSplitter::handle:horizontal {{
                width: 6px;
                margin: 4px 0px;
            }}
            QSplitter::handle:vertical {{
                height: 6px;
                margin: 0px 4px;
            }}
            QSplitter::handle:hover {{
                background-color: {t.accent};
            }}
            QSplitter::handle:pressed {{
                background-color: {t.accent_hover};
            }}

            /* Menu Bar */
            QMenuBar {{
                background-color: {t.secondary_background};
                color: {t.text_primary};
                border-bottom: 1px solid {t.border};
            }}
            QMenuBar::item:selected {{
                background-color: {t.accent};
                color: white;
            }}
            QMenu {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                color: {t.text_primary};
            }}
            QMenu::item:selected {{
                background-color: {t.accent};
                color: white;
            }}
            QMenu::separator {{
                height: 1px;
                background-color: {t.border};
                margin: 4px 8px;
            }}

            /* Status Bar */
            QStatusBar {{
                background-color: {t.secondary_background};
                border-top: 1px solid {t.border};
                color: {t.text_secondary};
            }}

            /* Tool Tips */
            QToolTip {{
                background-color: {t.secondary_background};
                border: 1px solid {t.border};
                color: {t.text_primary};
                padding: 4px;
            }}

            /* Message Box */
            QMessageBox {{
                background-color: {t.background};
            }}
            QMessageBox QLabel {{
                color: {t.text_primary};
            }}
        """


# Global theme manager instance
_theme_manager: ThemeManager | None = None


def get_theme_manager() -> ThemeManager:
    """Get the global theme manager instance.

    Returns:
        ThemeManager singleton instance.
    """
    global _theme_manager
    if _theme_manager is None:
        _theme_manager = ThemeManager()
    return _theme_manager
