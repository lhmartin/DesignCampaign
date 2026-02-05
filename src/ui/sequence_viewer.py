"""Interactive sequence viewer widget for protein structures.

This module provides a horizontal sequence viewer that displays amino acid
sequences with selection support and synchronizes with the 3D viewer.
"""

import logging
from typing import Any

from PyQt6.QtCore import Qt, pyqtSignal, QSize
from PyQt6.QtGui import QFont, QColor, QPainter, QPen, QBrush, QFontMetrics
from PyQt6.QtWidgets import (
    QWidget,
    QHBoxLayout,
    QVBoxLayout,
    QScrollArea,
    QLabel,
    QPushButton,
    QFrame,
    QSizePolicy,
)

from src.config.theme_manager import get_theme_manager
from src.config.settings import Theme

logger = logging.getLogger(__name__)


class ResidueCell(QWidget):
    """A single residue cell in the sequence viewer."""

    clicked = pyqtSignal(str, int, bool)  # (chain, residue_id, ctrl_held)

    # Cell size configurations
    CELL_SIZES = {
        "small": {"width": 14, "height": 18, "font": 8},
        "medium": {"width": 18, "height": 24, "font": 10},
        "large": {"width": 22, "height": 28, "font": 11},
    }

    # Default cell styling constants
    CELL_WIDTH = 22
    CELL_HEIGHT = 28
    FONT_SIZE = 11

    # Theme colors (class-level, updated by theme manager)
    _theme_bg = "#f8f8f8"
    _theme_fg = "#333333"
    _theme_border = "#cccccc"

    def __init__(
        self,
        residue_id: int,
        one_letter: str,
        three_letter: str,
        chain: str,
        parent=None,
    ):
        super().__init__(parent)
        self._residue_id = residue_id
        self._one_letter = one_letter
        self._three_letter = three_letter
        self._chain = chain
        self._selected = False
        self._interface = False
        self._color: str | None = None

        self.setFixedSize(self.CELL_WIDTH, self.CELL_HEIGHT)
        self.setToolTip(f"{chain}:{residue_id} {three_letter} ({one_letter})")
        self.setCursor(Qt.CursorShape.PointingHandCursor)

    @property
    def residue_id(self) -> int:
        return self._residue_id

    @property
    def is_selected(self) -> bool:
        return self._selected

    def set_selected(self, selected: bool) -> None:
        """Set the selection state."""
        if self._selected != selected:
            self._selected = selected
            self.update()

    def set_interface(self, is_interface: bool) -> None:
        """Set whether this residue is at an interface."""
        if self._interface != is_interface:
            self._interface = is_interface
            self.update()

    def set_color(self, color: str | None) -> None:
        """Set the background color (for metric coloring)."""
        if self._color != color:
            self._color = color
            self.update()

    def paintEvent(self, event):
        """Paint the residue cell."""
        painter = QPainter(self)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)

        # Background color
        if self._color:
            bg_color = QColor(self._color)
        elif self._selected:
            bg_color = QColor("#ffff00")  # Yellow for selection
        else:
            bg_color = QColor(ResidueCell._theme_bg)

        # Draw background
        painter.fillRect(0, 0, self.width(), self.height(), bg_color)

        # Draw interface marker (orange border)
        if self._interface:
            pen = QPen(QColor("#ff8c00"), 2)
            painter.setPen(pen)
            painter.drawRect(1, 1, self.width() - 2, self.height() - 2)

        # Draw selection border
        if self._selected:
            pen = QPen(QColor("#cc9900"), 2)
            painter.setPen(pen)
            painter.drawRect(1, 1, self.width() - 2, self.height() - 2)

        # Draw text
        font = QFont("Consolas, Monaco, monospace", self.FONT_SIZE)
        font.setBold(True)
        painter.setFont(font)

        # Text color based on background brightness
        if self._color:
            color = QColor(self._color)
            brightness = (color.red() * 299 + color.green() * 587 + color.blue() * 114) / 1000
            text_color = QColor("#000000") if brightness > 128 else QColor("#ffffff")
        elif self._selected:
            text_color = QColor("#333333")  # Dark text on yellow selection
        else:
            text_color = QColor(ResidueCell._theme_fg)

        painter.setPen(text_color)
        painter.drawText(
            0, 0, self.width(), self.height(),
            Qt.AlignmentFlag.AlignCenter,
            self._one_letter
        )

    @classmethod
    def set_theme_colors(cls, bg: str, fg: str, border: str) -> None:
        """Set theme colors for all cells.

        Args:
            bg: Background color hex string.
            fg: Foreground (text) color hex string.
            border: Border color hex string.
        """
        cls._theme_bg = bg
        cls._theme_fg = fg
        cls._theme_border = border

    @property
    def chain(self) -> str:
        return self._chain

    def mousePressEvent(self, event):
        """Handle mouse click."""
        if event.button() == Qt.MouseButton.LeftButton:
            ctrl = event.modifiers() & Qt.KeyboardModifier.ControlModifier
            self.clicked.emit(self._chain, self._residue_id, bool(ctrl))

    def set_cell_size(self, size_name: str) -> None:
        """Set the cell size.

        Args:
            size_name: One of "small", "medium", "large".
        """
        if size_name not in self.CELL_SIZES:
            return
        config = self.CELL_SIZES[size_name]
        ResidueCell.CELL_WIDTH = config["width"]
        ResidueCell.CELL_HEIGHT = config["height"]
        ResidueCell.FONT_SIZE = config["font"]
        self.setFixedSize(config["width"], config["height"])
        self.update()


class ChainSeparator(QFrame):
    """Visual separator between chains."""

    def __init__(self, chain_id: str, parent=None):
        super().__init__(parent)
        self._chain_id = chain_id
        self.setFixedWidth(24)
        self.setFixedHeight(ResidueCell.CELL_HEIGHT)
        self.setToolTip(f"Chain {chain_id}")

    def paintEvent(self, event):
        """Paint the chain separator."""
        painter = QPainter(self)

        # Draw vertical line
        pen = QPen(QColor("#999999"), 1)
        painter.setPen(pen)
        x = self.width() // 2
        painter.drawLine(x, 2, x, self.height() - 2)

        # Draw chain label
        font = QFont("Arial", 8)
        font.setBold(True)
        painter.setFont(font)
        painter.setPen(QColor("#666666"))
        painter.drawText(
            0, 0, self.width(), self.height(),
            Qt.AlignmentFlag.AlignCenter,
            self._chain_id
        )


class SequenceViewer(QWidget):
    """Interactive sequence viewer with selection support.

    Displays the protein sequence as a horizontal strip of residue cells.
    Supports click selection, multi-select, and syncs with 3D viewer.

    Signals:
        residue_clicked(str, int, bool): Emitted when a residue is clicked (chain, id, ctrl_held).
        selection_changed(list[dict]): Emitted when the selection changes (list of {chain, id}).
    """

    residue_clicked = pyqtSignal(str, int, bool)
    selection_changed = pyqtSignal(list)

    def __init__(self, parent=None):
        super().__init__(parent)
        # Key is (chain, residue_id) tuple to handle multi-chain structures
        self._residue_cells: dict[tuple[str, int], ResidueCell] = {}
        self._selected_keys: set[tuple[str, int]] = set()  # set of (chain, id) tuples
        self._interface_keys: set[tuple[str, int]] = set()  # set of (chain, id) tuples
        self._current_size: str = "large"  # Default size
        self._cached_sequence: list[dict[str, Any]] | None = None
        self._init_ui()
        self._setup_theme_listener()

    def _init_ui(self):
        """Initialize the UI."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header with controls
        header = QWidget()
        header_layout = QHBoxLayout(header)
        header_layout.setContentsMargins(5, 2, 5, 2)
        header_layout.setSpacing(5)

        self._label = QLabel("Sequence")
        self._label.setStyleSheet("font-weight: bold; font-size: 11px;")
        header_layout.addWidget(self._label)

        header_layout.addStretch()

        # Size controls
        size_label = QLabel("Size:")
        size_label.setStyleSheet("font-size: 10px;")
        header_layout.addWidget(size_label)

        self._btn_size_small = QPushButton("S")
        self._btn_size_small.setFixedSize(22, 20)
        self._btn_size_small.setToolTip("Small cells")
        self._btn_size_small.clicked.connect(lambda: self.set_cell_size("small"))
        header_layout.addWidget(self._btn_size_small)

        self._btn_size_medium = QPushButton("M")
        self._btn_size_medium.setFixedSize(22, 20)
        self._btn_size_medium.setToolTip("Medium cells")
        self._btn_size_medium.clicked.connect(lambda: self.set_cell_size("medium"))
        header_layout.addWidget(self._btn_size_medium)

        self._btn_size_large = QPushButton("L")
        self._btn_size_large.setFixedSize(22, 20)
        self._btn_size_large.setToolTip("Large cells")
        self._btn_size_large.clicked.connect(lambda: self.set_cell_size("large"))
        header_layout.addWidget(self._btn_size_large)

        header_layout.addSpacing(8)

        self._btn_scroll_to_selection = QPushButton("Go to Selection")
        self._btn_scroll_to_selection.setFixedHeight(20)
        self._btn_scroll_to_selection.setStyleSheet("font-size: 10px;")
        self._btn_scroll_to_selection.clicked.connect(self._scroll_to_selection)
        self._btn_scroll_to_selection.setEnabled(False)
        header_layout.addWidget(self._btn_scroll_to_selection)

        layout.addWidget(header)

        # Scroll area for sequence
        self._scroll_area = QScrollArea()
        self._scroll_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOn)
        self._scroll_area.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self._scroll_area.setWidgetResizable(False)
        self._scroll_area.setFixedHeight(ResidueCell.CELL_HEIGHT + 20)

        # Container for residue cells
        self._sequence_container = QWidget()
        self._sequence_layout = QHBoxLayout(self._sequence_container)
        self._sequence_layout.setContentsMargins(5, 0, 5, 0)
        self._sequence_layout.setSpacing(1)

        self._scroll_area.setWidget(self._sequence_container)
        layout.addWidget(self._scroll_area)

        # Style
        self.setStyleSheet("""
            SequenceViewer {
                background-color: #f0f0f0;
                border-bottom: 1px solid #ccc;
            }
        """)
        self.setFixedHeight(ResidueCell.CELL_HEIGHT + 45)

    def set_sequence(self, sequence: list[dict[str, Any]]) -> None:
        """Set the sequence to display.

        Args:
            sequence: List of residue dicts with 'id', 'one_letter', 'name', 'chain'.
        """
        logger.debug(f"SequenceViewer.set_sequence: received {len(sequence) if sequence else 0} residues")

        # Cache for size changes
        self._cached_sequence = sequence

        # Clear existing cells
        self.clear()

        if not sequence:
            logger.warning("SequenceViewer.set_sequence: sequence is empty or None")
            self._label.setText("No sequence loaded")
            return

        logger.debug(f"SequenceViewer.set_sequence: first 3 residues = {sequence[:3]}")
        current_chain = None

        for res in sequence:
            chain = res.get("chain", "")

            # Add chain separator if chain changes
            if current_chain is not None and chain != current_chain:
                separator = ChainSeparator(chain)
                self._sequence_layout.addWidget(separator)

            current_chain = chain

            # Create residue cell
            cell = ResidueCell(
                residue_id=res["id"],
                one_letter=res.get("one_letter", "X"),
                three_letter=res.get("name", "UNK"),
                chain=chain,
            )
            cell.clicked.connect(self._on_cell_clicked)

            # Use (chain, residue_id) tuple as key to handle multi-chain structures
            self._residue_cells[(chain, res["id"])] = cell
            self._sequence_layout.addWidget(cell)

        # Don't add stretch - it interferes with size calculation
        logger.debug(f"SequenceViewer.set_sequence: created {len(self._residue_cells)} residue cells")

        # Update label
        num_residues = len(self._residue_cells)
        chains = set(r.get("chain", "") for r in sequence)
        chain_str = ", ".join(sorted(str(c) for c in chains)) if chains else ""
        self._label.setText(f"Sequence: {num_residues} residues ({chain_str})")

        # CRITICAL: Explicitly set container size since adjustSize() doesn't work with scroll area
        # Calculate width directly using known fixed cell sizes (sizeHint() returns 0 before layout)
        spacing = self._sequence_layout.spacing()
        margins = self._sequence_layout.contentsMargins()

        # Count cells and separators
        num_cells = len(self._residue_cells)
        num_separators = len(chains) - 1 if len(chains) > 1 else 0

        # Calculate total width: margins + cells + separators + spacing between all widgets
        total_widgets = num_cells + num_separators
        total_width = (
            margins.left() + margins.right() +
            num_cells * ResidueCell.CELL_WIDTH +
            num_separators * 24 +  # ChainSeparator width is 24
            (total_widgets - 1) * spacing if total_widgets > 0 else 0
        )

        # Set fixed size for container - height is cell height
        container_height = ResidueCell.CELL_HEIGHT
        self._sequence_container.setFixedSize(total_width, container_height)
        logger.debug(f"SequenceViewer.set_sequence: container size set to {total_width}x{container_height} ({num_cells} cells, {num_separators} separators)")

    def clear(self) -> None:
        """Clear the sequence display."""
        # Remove all widgets from layout
        while self._sequence_layout.count():
            item = self._sequence_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        self._residue_cells.clear()
        self._selected_keys.clear()
        self._interface_keys.clear()
        self._label.setText("No sequence loaded")
        self._btn_scroll_to_selection.setEnabled(False)

    def set_selection(self, selection: list[dict[str, Any]]) -> None:
        """Update the selection (called from 3D viewer sync).

        Args:
            selection: List of dicts with 'chain' and 'id' keys.
        """
        # Update internal state
        self._selected_keys = {(item["chain"], item["id"]) for item in selection}

        # Update cell states
        for key, cell in self._residue_cells.items():
            cell.set_selected(key in self._selected_keys)

        # Enable/disable scroll button
        self._btn_scroll_to_selection.setEnabled(len(self._selected_keys) > 0)

    def set_interface_residues(self, interface: list[dict[str, Any]]) -> None:
        """Mark residues as interface residues.

        Args:
            interface: List of dicts with 'chain' and 'id' keys.
        """
        self._interface_keys = {(item["chain"], item["id"]) for item in interface}

        for key, cell in self._residue_cells.items():
            cell.set_interface(key in self._interface_keys)

    def clear_interface(self) -> None:
        """Clear interface markers."""
        self._interface_keys.clear()
        for cell in self._residue_cells.values():
            cell.set_interface(False)

    def set_coloring(self, color_map: dict[tuple[str, int], str]) -> None:
        """Apply coloring to residues.

        Args:
            color_map: Dict mapping (chain, residue_id) tuples to hex color strings.
        """
        for key, cell in self._residue_cells.items():
            color = color_map.get(key)
            cell.set_color(color)

    def clear_coloring(self) -> None:
        """Clear all custom coloring."""
        for cell in self._residue_cells.values():
            cell.set_color(None)

    def _on_cell_clicked(self, chain: str, residue_id: int, ctrl_held: bool) -> None:
        """Handle cell click."""
        key = (chain, residue_id)

        # Update selection based on ctrl key
        if ctrl_held:
            if key in self._selected_keys:
                self._selected_keys.discard(key)
            else:
                self._selected_keys.add(key)
        else:
            self._selected_keys = {key}

        # Update visual state
        for cell_key, cell in self._residue_cells.items():
            cell.set_selected(cell_key in self._selected_keys)

        # Enable/disable scroll button
        self._btn_scroll_to_selection.setEnabled(len(self._selected_keys) > 0)

        # Emit signals - convert to list of dicts for external use
        self.residue_clicked.emit(chain, residue_id, ctrl_held)
        selection_list = [{"chain": c, "id": r} for c, r in self._selected_keys]
        self.selection_changed.emit(selection_list)

    def _scroll_to_selection(self) -> None:
        """Scroll to show the first selected residue."""
        if not self._selected_keys:
            return

        # Get the first selected key (sorted by chain, then residue id)
        first_key = min(self._selected_keys)
        cell = self._residue_cells.get(first_key)
        if cell:
            self._scroll_area.ensureWidgetVisible(cell, 50, 0)

    def get_selected(self) -> list[dict[str, Any]]:
        """Get the currently selected residues as list of dicts."""
        return [{"chain": c, "id": r} for c, r in self._selected_keys]

    def get_interface(self) -> list[dict[str, Any]]:
        """Get the interface residues as list of dicts."""
        return [{"chain": c, "id": r} for c, r in self._interface_keys]

    def set_cell_size(self, size_name: str) -> None:
        """Change the cell size and rebuild the sequence display.

        Args:
            size_name: One of "small", "medium", "large".
        """
        if size_name not in ResidueCell.CELL_SIZES:
            return

        if size_name == self._current_size:
            return

        self._current_size = size_name

        # Update class-level constants
        config = ResidueCell.CELL_SIZES[size_name]
        ResidueCell.CELL_WIDTH = config["width"]
        ResidueCell.CELL_HEIGHT = config["height"]
        ResidueCell.FONT_SIZE = config["font"]

        # Update scroll area height
        self._scroll_area.setFixedHeight(ResidueCell.CELL_HEIGHT + 20)
        self.setFixedHeight(ResidueCell.CELL_HEIGHT + 45)

        # Rebuild sequence if we have one cached
        if self._cached_sequence:
            # Store current selection and interface
            selected = self._selected_keys.copy()
            interface = self._interface_keys.copy()

            # Rebuild
            self.set_sequence(self._cached_sequence)

            # Restore selection and interface
            self._selected_keys = selected
            self._interface_keys = interface
            for key, cell in self._residue_cells.items():
                cell.set_selected(key in selected)
                cell.set_interface(key in interface)

    @property
    def current_size(self) -> str:
        """Get the current cell size name."""
        return self._current_size

    def _setup_theme_listener(self) -> None:
        """Set up theme change listener."""
        theme_manager = get_theme_manager()
        theme_manager.add_listener(self._on_theme_changed)
        # Apply current theme
        self._on_theme_changed(theme_manager.current_theme)

    def _on_theme_changed(self, theme: Theme) -> None:
        """Handle theme change.

        Args:
            theme: New theme object.
        """
        # Update cell theme colors
        if theme.name == "dark":
            ResidueCell.set_theme_colors(
                bg="#2d2d2d",
                fg="#e0e0e0",
                border="#555555",
            )
        else:
            ResidueCell.set_theme_colors(
                bg="#f8f8f8",
                fg="#333333",
                border="#cccccc",
            )

        # Update viewer background
        bg_color = theme.secondary_background
        self.setStyleSheet(f"""
            SequenceViewer {{
                background-color: {bg_color};
                border-bottom: 1px solid {theme.border};
            }}
        """)

        # Update all existing cells
        for cell in self._residue_cells.values():
            cell.update()
