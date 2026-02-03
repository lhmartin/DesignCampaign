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

logger = logging.getLogger(__name__)


class ResidueCell(QWidget):
    """A single residue cell in the sequence viewer."""

    clicked = pyqtSignal(int, bool)  # (residue_id, ctrl_held)

    # Cell styling constants
    CELL_WIDTH = 22
    CELL_HEIGHT = 28
    FONT_SIZE = 11

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
            bg_color = QColor("#f8f8f8")

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
        else:
            text_color = QColor("#333333")

        painter.setPen(text_color)
        painter.drawText(
            0, 0, self.width(), self.height(),
            Qt.AlignmentFlag.AlignCenter,
            self._one_letter
        )

    def mousePressEvent(self, event):
        """Handle mouse click."""
        if event.button() == Qt.MouseButton.LeftButton:
            ctrl = event.modifiers() & Qt.KeyboardModifier.ControlModifier
            self.clicked.emit(self._residue_id, bool(ctrl))


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
        residue_clicked(int, bool): Emitted when a residue is clicked (id, ctrl_held).
        selection_changed(list[int]): Emitted when the selection changes.
    """

    residue_clicked = pyqtSignal(int, bool)
    selection_changed = pyqtSignal(list)

    def __init__(self, parent=None):
        super().__init__(parent)
        self._residue_cells: dict[int, ResidueCell] = {}
        self._selected_ids: set[int] = set()
        self._interface_ids: set[int] = set()
        self._init_ui()

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

            self._residue_cells[res["id"]] = cell
            self._sequence_layout.addWidget(cell)

        # Don't add stretch - it interferes with size calculation
        logger.debug(f"SequenceViewer.set_sequence: created {len(self._residue_cells)} residue cells")

        # Update label
        num_residues = len(self._residue_cells)
        chains = set(r.get("chain", "") for r in sequence)
        chain_str = ", ".join(sorted(str(c) for c in chains)) if chains else ""
        self._label.setText(f"Sequence: {num_residues} residues ({chain_str})")

        # CRITICAL: Explicitly set container size since adjustSize() doesn't work with scroll area
        # Calculate width based on number of widgets in layout
        spacing = self._sequence_layout.spacing()
        margins = self._sequence_layout.contentsMargins()
        total_width = margins.left() + margins.right()

        for i in range(self._sequence_layout.count()):
            item = self._sequence_layout.itemAt(i)
            if item and item.widget():
                total_width += item.widget().sizeHint().width() + spacing

        # Set fixed size for container - height is cell height
        container_height = ResidueCell.CELL_HEIGHT
        self._sequence_container.setFixedSize(total_width, container_height)
        logger.debug(f"SequenceViewer.set_sequence: container size set to {total_width}x{container_height}")

    def clear(self) -> None:
        """Clear the sequence display."""
        # Remove all widgets from layout
        while self._sequence_layout.count():
            item = self._sequence_layout.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        self._residue_cells.clear()
        self._selected_ids.clear()
        self._interface_ids.clear()
        self._label.setText("No sequence loaded")
        self._btn_scroll_to_selection.setEnabled(False)

    def set_selection(self, residue_ids: list[int]) -> None:
        """Update the selection (called from 3D viewer sync).

        Args:
            residue_ids: List of selected residue IDs.
        """
        # Update internal state
        self._selected_ids = set(residue_ids)

        # Update cell states
        for res_id, cell in self._residue_cells.items():
            cell.set_selected(res_id in self._selected_ids)

        # Enable/disable scroll button
        self._btn_scroll_to_selection.setEnabled(len(self._selected_ids) > 0)

    def set_interface_residues(self, residue_ids: list[int]) -> None:
        """Mark residues as interface residues.

        Args:
            residue_ids: List of interface residue IDs.
        """
        self._interface_ids = set(residue_ids)

        for res_id, cell in self._residue_cells.items():
            cell.set_interface(res_id in self._interface_ids)

    def clear_interface(self) -> None:
        """Clear interface markers."""
        self._interface_ids.clear()
        for cell in self._residue_cells.values():
            cell.set_interface(False)

    def set_coloring(self, color_map: dict[int, str]) -> None:
        """Apply coloring to residues.

        Args:
            color_map: Dict mapping residue IDs to hex color strings.
        """
        for res_id, cell in self._residue_cells.items():
            color = color_map.get(res_id)
            cell.set_color(color)

    def clear_coloring(self) -> None:
        """Clear all custom coloring."""
        for cell in self._residue_cells.values():
            cell.set_color(None)

    def _on_cell_clicked(self, residue_id: int, ctrl_held: bool) -> None:
        """Handle cell click."""
        # Update selection based on ctrl key
        if ctrl_held:
            if residue_id in self._selected_ids:
                self._selected_ids.discard(residue_id)
            else:
                self._selected_ids.add(residue_id)
        else:
            self._selected_ids = {residue_id}

        # Update visual state
        for res_id, cell in self._residue_cells.items():
            cell.set_selected(res_id in self._selected_ids)

        # Enable/disable scroll button
        self._btn_scroll_to_selection.setEnabled(len(self._selected_ids) > 0)

        # Emit signals
        self.residue_clicked.emit(residue_id, ctrl_held)
        self.selection_changed.emit(list(self._selected_ids))

    def _scroll_to_selection(self) -> None:
        """Scroll to show the first selected residue."""
        if not self._selected_ids:
            return

        first_selected = min(self._selected_ids)
        cell = self._residue_cells.get(first_selected)
        if cell:
            self._scroll_area.ensureWidgetVisible(cell, 50, 0)

    def get_selected_ids(self) -> list[int]:
        """Get the currently selected residue IDs."""
        return list(self._selected_ids)

    def get_interface_ids(self) -> list[int]:
        """Get the interface residue IDs."""
        return list(self._interface_ids)
