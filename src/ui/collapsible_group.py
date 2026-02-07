"""Collapsible group box widget for organizing panel sections."""

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QToolButton,
    QLabel,
    QFrame,
    QSizePolicy,
)


class CollapsibleGroupBox(QWidget):
    """A group box with a clickable header that toggles content visibility.

    Signals:
        collapsed_changed: Emitted when collapsed state changes (bool: is_collapsed).
    """

    collapsed_changed = pyqtSignal(bool)

    def __init__(self, title: str, collapsed: bool = False, parent=None):
        """Initialize the collapsible group box.

        Args:
            title: Header text.
            collapsed: Whether to start collapsed.
            parent: Parent widget.
        """
        super().__init__(parent)
        self._collapsed = collapsed
        self._title = title
        self._init_ui(title)
        self._set_collapsed_visual(collapsed)

    def _init_ui(self, title: str):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header bar
        self._header = QWidget()
        self._header.setCursor(Qt.CursorShape.PointingHandCursor)
        self._header.setStyleSheet(
            "QWidget { background-color: palette(midlight); "
            "border: 1px solid palette(mid); border-radius: 3px; }"
        )
        header_layout = QHBoxLayout(self._header)
        header_layout.setContentsMargins(6, 4, 6, 4)
        header_layout.setSpacing(4)

        # Arrow indicator
        self._arrow = QToolButton()
        self._arrow.setStyleSheet("QToolButton { border: none; background: none; }")
        self._arrow.setFixedSize(16, 16)
        self._arrow.setArrowType(Qt.ArrowType.DownArrow)
        self._arrow.clicked.connect(self.toggle)
        header_layout.addWidget(self._arrow)

        # Title label
        self._title_label = QLabel(title)
        self._title_label.setStyleSheet("QLabel { font-weight: bold; border: none; background: none; }")
        header_layout.addWidget(self._title_label)
        header_layout.addStretch()

        self._header.mousePressEvent = lambda e: self.toggle()
        layout.addWidget(self._header)

        # Content area
        self._content = QWidget()
        self._content_layout = QVBoxLayout(self._content)
        self._content_layout.setContentsMargins(0, 4, 0, 0)
        self._content_layout.setSpacing(8)
        layout.addWidget(self._content)

    @property
    def content_layout(self) -> QVBoxLayout:
        """Get the layout for adding content widgets."""
        return self._content_layout

    def add_widget(self, widget: QWidget) -> None:
        """Add a widget to the content area.

        Args:
            widget: Widget to add.
        """
        self._content_layout.addWidget(widget)

    def add_layout(self, layout) -> None:
        """Add a layout to the content area.

        Args:
            layout: Layout to add.
        """
        self._content_layout.addLayout(layout)

    @property
    def is_collapsed(self) -> bool:
        """Whether the group is collapsed."""
        return self._collapsed

    @property
    def title(self) -> str:
        """Get the group title."""
        return self._title

    def set_collapsed(self, collapsed: bool) -> None:
        """Set the collapsed state.

        Args:
            collapsed: Whether to collapse.
        """
        if collapsed == self._collapsed:
            return
        self._collapsed = collapsed
        self._set_collapsed_visual(collapsed)
        self.collapsed_changed.emit(collapsed)

    def toggle(self) -> None:
        """Toggle collapsed state."""
        self.set_collapsed(not self._collapsed)

    def _set_collapsed_visual(self, collapsed: bool) -> None:
        """Update visual state for collapsed/expanded."""
        self._content.setVisible(not collapsed)
        self._arrow.setArrowType(
            Qt.ArrowType.RightArrow if collapsed else Qt.ArrowType.DownArrow
        )
