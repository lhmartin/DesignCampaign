"""Multi-structure comparison dialog."""

import logging
from pathlib import Path

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QComboBox,
    QTreeWidget,
    QTreeWidgetItem,
    QHeaderView,
    QFrame,
    QMessageBox,
    QFileDialog,
)
from PyQt6.QtGui import QColor

from src.config.color_schemes import CHAIN_COLORS

logger = logging.getLogger(__name__)

# Distinct colors for comparison structures (skip index 0 = primary)
COMPARISON_COLORS = [
    "#ff7f0e",  # orange
    "#2ca02c",  # green
    "#d62728",  # red
    "#9467bd",  # purple
    "#8c564b",  # brown
    "#e377c2",  # pink
    "#bcbd22",  # olive
    "#17becf",  # cyan
]


class ComparisonDialog(QDialog):
    """Dialog for aligning and comparing multiple structures."""

    def __init__(
        self,
        reference_name: str,
        chains: list[str],
        grouping_manager=None,
        file_list_paths: list[str] | None = None,
        parent=None,
    ):
        """Initialize the comparison dialog.

        Args:
            reference_name: Name of the reference (current) structure.
            chains: Chain IDs in the reference structure.
            grouping_manager: GroupingManager for accessing groups.
            file_list_paths: All file paths from the file list.
            parent: Parent widget.
        """
        super().__init__(parent)
        self.setWindowTitle("Compare Structures")
        self.setMinimumSize(500, 400)

        self._reference_name = reference_name
        self._chains = chains
        self._grouping_manager = grouping_manager
        self._file_list_paths = file_list_paths or []
        self._comparison_files: list[str] = []  # file paths to compare
        self._results: list[dict] = []  # [{name, path, rmsd, color, visible}, ...]

        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setSpacing(8)

        # Reference info
        ref_layout = QHBoxLayout()
        ref_layout.addWidget(QLabel("Reference:"))
        ref_label = QLabel(f"<b>{self._reference_name}</b>")
        ref_layout.addWidget(ref_label)
        ref_layout.addStretch()
        layout.addLayout(ref_layout)

        # Alignment chain selection
        chain_layout = QHBoxLayout()
        chain_layout.addWidget(QLabel("Align on chain:"))
        self._chain_combo = QComboBox()
        for chain in self._chains:
            self._chain_combo.addItem(chain)
        chain_layout.addWidget(self._chain_combo)
        chain_layout.addStretch()
        layout.addLayout(chain_layout)

        # Separator
        sep = QFrame()
        sep.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(sep)

        # Add structures buttons
        add_layout = QHBoxLayout()

        self._add_group_btn = QPushButton("Add from Group...")
        self._add_group_btn.setToolTip("Add structures from a named group")
        self._add_group_btn.clicked.connect(self._on_add_from_group)
        if not self._grouping_manager:
            self._add_group_btn.setEnabled(False)
        add_layout.addWidget(self._add_group_btn)

        self._add_files_btn = QPushButton("Add Files...")
        self._add_files_btn.setToolTip("Add structure files to compare")
        self._add_files_btn.clicked.connect(self._on_add_files)
        add_layout.addWidget(self._add_files_btn)

        self._clear_btn = QPushButton("Clear")
        self._clear_btn.setToolTip("Remove all comparison structures")
        self._clear_btn.clicked.connect(self._on_clear)
        add_layout.addWidget(self._clear_btn)

        add_layout.addStretch()
        layout.addLayout(add_layout)

        # Results tree
        self._tree = QTreeWidget()
        self._tree.setHeaderLabels(["Visible", "Name", "RMSD (A)", "Color"])
        self._tree.header().setSectionResizeMode(
            0, QHeaderView.ResizeMode.ResizeToContents
        )
        self._tree.header().setSectionResizeMode(
            1, QHeaderView.ResizeMode.Stretch
        )
        self._tree.header().setSectionResizeMode(
            2, QHeaderView.ResizeMode.ResizeToContents
        )
        self._tree.header().setSectionResizeMode(
            3, QHeaderView.ResizeMode.ResizeToContents
        )
        self._tree.setRootIsDecorated(False)
        self._tree.itemChanged.connect(self._on_item_changed)
        layout.addWidget(self._tree, 1)

        # Status label
        self._status_label = QLabel("Add structures to compare")
        self._status_label.setStyleSheet("color: #666; font-size: 11px;")
        layout.addWidget(self._status_label)

        # Action buttons
        btn_layout = QHBoxLayout()

        self._align_btn = QPushButton("Align All")
        self._align_btn.setToolTip("Align all added structures onto the reference")
        self._align_btn.clicked.connect(self._on_align_all)
        self._align_btn.setEnabled(False)
        btn_layout.addWidget(self._align_btn)

        self._clear_viewer_btn = QPushButton("Clear Viewer")
        self._clear_viewer_btn.setToolTip("Remove comparison models from viewer")
        self._clear_viewer_btn.clicked.connect(self._on_clear_viewer)
        btn_layout.addWidget(self._clear_viewer_btn)

        btn_layout.addStretch()

        close_btn = QPushButton("Close")
        close_btn.clicked.connect(self.accept)
        btn_layout.addWidget(close_btn)

        layout.addLayout(btn_layout)

    def _on_add_from_group(self) -> None:
        """Add structures from a custom group."""
        if not self._grouping_manager:
            return

        groups = self._grouping_manager.get_custom_groups()
        if not groups:
            QMessageBox.information(
                self, "No Groups", "No custom groups available."
            )
            return

        # Simple selection via combo dialog
        from PyQt6.QtWidgets import QInputDialog

        group_names = [g.name for g in groups]
        name, ok = QInputDialog.getItem(
            self, "Select Group", "Group:", group_names, 0, False
        )
        if not ok:
            return

        # Find the group
        selected_group = next((g for g in groups if g.name == name), None)
        if not selected_group:
            return

        added = 0
        for member_path in selected_group.members:
            if member_path not in self._comparison_files:
                self._comparison_files.append(member_path)
                self._add_tree_item(Path(member_path).stem, member_path)
                added += 1

        self._align_btn.setEnabled(len(self._comparison_files) > 0)
        self._status_label.setText(
            f"Added {added} from '{name}' ({len(self._comparison_files)} total)"
        )

    def _on_add_files(self) -> None:
        """Add structure files via file dialog."""
        file_paths, _ = QFileDialog.getOpenFileNames(
            self,
            "Select Structure Files",
            "",
            "Protein files (*.pdb *.cif);;All files (*)",
        )
        if not file_paths:
            return

        added = 0
        for fp in file_paths:
            if fp not in self._comparison_files:
                self._comparison_files.append(fp)
                self._add_tree_item(Path(fp).stem, fp)
                added += 1

        self._align_btn.setEnabled(len(self._comparison_files) > 0)
        self._status_label.setText(
            f"Added {added} file(s) ({len(self._comparison_files)} total)"
        )

    def _add_tree_item(self, name: str, file_path: str) -> None:
        """Add an item to the tree widget."""
        idx = self._tree.topLevelItemCount()
        color = COMPARISON_COLORS[idx % len(COMPARISON_COLORS)]

        item = QTreeWidgetItem()
        item.setCheckState(0, Qt.CheckState.Checked)
        item.setText(1, name)
        item.setText(2, "—")
        item.setData(1, Qt.ItemDataRole.UserRole, file_path)
        item.setData(3, Qt.ItemDataRole.UserRole, color)

        # Color swatch in text
        item.setText(3, "")
        item.setBackground(3, QColor(color))

        self._tree.addTopLevelItem(item)

    def _on_clear(self) -> None:
        """Clear all comparison structures."""
        self._comparison_files.clear()
        self._results.clear()
        self._tree.clear()
        self._align_btn.setEnabled(False)
        self._status_label.setText("Add structures to compare")

    def _on_item_changed(self, item: QTreeWidgetItem, column: int) -> None:
        """Handle checkbox toggle for visibility."""
        if column != 0:
            return
        # This will be connected to viewer visibility in MainWindow
        pass

    def _on_align_all(self) -> None:
        """Signal that alignment should proceed (handled by MainWindow)."""
        self._status_label.setText("Aligning...")
        # The actual alignment is driven by MainWindow connecting to this
        self.done(QDialog.DialogCode.Accepted)

    def _on_clear_viewer(self) -> None:
        """Signal that viewer comparison models should be cleared."""
        # Will be handled by MainWindow
        pass

    @property
    def align_chain(self) -> str:
        """Get the selected alignment chain."""
        return self._chain_combo.currentText()

    @property
    def comparison_files(self) -> list[str]:
        """Get list of file paths to compare."""
        return self._comparison_files.copy()

    def get_comparison_colors(self) -> list[str]:
        """Get the assigned color for each comparison file."""
        colors = []
        for i in range(self._tree.topLevelItemCount()):
            item = self._tree.item(i) if hasattr(self._tree, 'item') else self._tree.topLevelItem(i)
            color = item.data(3, Qt.ItemDataRole.UserRole)
            colors.append(color or COMPARISON_COLORS[i % len(COMPARISON_COLORS)])
        return colors

    def set_alignment_results(self, results: list[dict]) -> None:
        """Update the tree with alignment results.

        Args:
            results: List of dicts with keys: name, rmsd, error.
        """
        self._results = results
        for i, result in enumerate(results):
            if i >= self._tree.topLevelItemCount():
                break
            item = self._tree.topLevelItem(i)
            if "error" in result:
                item.setText(2, f"Error: {result['error']}")
                item.setCheckState(0, Qt.CheckState.Unchecked)
            else:
                item.setText(2, f"{result['rmsd']:.3f}")
