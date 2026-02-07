"""File list widget for browsing protein structure files with grouping support."""

from pathlib import Path
from typing import TYPE_CHECKING

from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QPushButton,
    QTreeWidget,
    QTreeWidgetItem,
    QFileDialog,
    QLabel,
    QMessageBox,
)

from src.utils.file_utils import get_protein_files
from src.config.settings import SUPPORTED_FORMATS

if TYPE_CHECKING:
    from src.models.grouping import GroupingManager, StructureGroup


class FileListWidget(QWidget):
    """Widget for selecting and listing protein structure files with grouping.

    Displays a flat file list when no target groups exist, or a 2-level
    hierarchy when target groups are present:
      - Level 1: Target groups (structures sharing a target chain sequence)
      - Level 2: Binder sub-groups (structures with identical binder sequences)
    Custom groups (from binder/chain search) are shown as separate sections.

    Signals:
        file_selected: Emitted when a file is selected (with file path).
        folder_changed: Emitted when the folder is changed (with folder path).
    """

    file_selected = pyqtSignal(str)  # Emits the file path
    folder_changed = pyqtSignal(str)  # Emits the folder path

    # Data roles for storing data in tree items
    FILE_PATH_ROLE = Qt.ItemDataRole.UserRole
    GROUP_ID_ROLE = Qt.ItemDataRole.UserRole + 1

    def __init__(self, parent=None):
        """Initialize the file list widget.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self._current_folder: str | None = None
        self._files: list[Path] = []
        self._grouping_manager: "GroupingManager | None" = None
        self._init_ui()

    def _init_ui(self):
        """Initialize the UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(8, 8, 8, 8)
        layout.setSpacing(8)

        # Header with folder button
        header_layout = QHBoxLayout()
        header_layout.setSpacing(8)

        self._open_button = QPushButton("Open Folder")
        self._open_button.setToolTip("Select a folder containing protein structure files")
        self._open_button.clicked.connect(self._on_open_folder)
        header_layout.addWidget(self._open_button)

        self._refresh_button = QPushButton("Refresh")
        self._refresh_button.setToolTip("Refresh the file list")
        self._refresh_button.clicked.connect(self._refresh_files)
        self._refresh_button.setEnabled(False)
        header_layout.addWidget(self._refresh_button)

        layout.addLayout(header_layout)

        # Folder path label
        self._folder_label = QLabel("No folder selected")
        self._folder_label.setWordWrap(True)
        self._folder_label.setStyleSheet("QLabel { color: #666; font-size: 11px; }")
        layout.addWidget(self._folder_label)

        # File count label
        self._count_label = QLabel("")
        self._count_label.setStyleSheet("QLabel { color: #666; font-size: 11px; }")
        layout.addWidget(self._count_label)

        # Tree widget for files
        self._file_tree = QTreeWidget()
        self._file_tree.setHeaderHidden(True)
        self._file_tree.setToolTip("Click to select a file, double-click to load")
        self._file_tree.itemClicked.connect(self._on_item_clicked)
        self._file_tree.itemDoubleClicked.connect(self._on_item_double_clicked)
        self._file_tree.setIndentation(16)
        self._file_tree.setAnimated(True)
        layout.addWidget(self._file_tree, 1)  # Stretch factor 1 to fill space

        # Format info
        formats_str = ", ".join(f"*{fmt}" for fmt in SUPPORTED_FORMATS)
        info_label = QLabel(f"Supported formats: {formats_str}")
        info_label.setStyleSheet("QLabel { color: #999; font-size: 10px; }")
        layout.addWidget(info_label)

    def set_grouping_manager(self, manager: "GroupingManager") -> None:
        """Set the grouping manager for computing groups.

        Args:
            manager: GroupingManager instance.
        """
        self._grouping_manager = manager

    def _on_open_folder(self):
        """Handle the open folder button click."""
        # Use non-native dialog to ensure files are visible while selecting folder
        dialog = QFileDialog(self, "Select Folder with Protein Files")
        dialog.setFileMode(QFileDialog.FileMode.Directory)
        dialog.setOption(QFileDialog.Option.ShowDirsOnly, False)
        dialog.setOption(QFileDialog.Option.DontUseNativeDialog, True)
        dialog.setNameFilters(["Protein files (*.pdb *.cif)", "JSON files (*.json)", "All files (*)"])

        if dialog.exec() == QFileDialog.DialogCode.Accepted:
            folder = dialog.selectedFiles()[0]
            self.load_folder(folder)

    def load_folder(self, folder_path: str) -> None:
        """Load protein files from a folder.

        Args:
            folder_path: Path to the folder to load.
        """
        try:
            self._files = get_protein_files(folder_path)
            self._current_folder = folder_path
            self._refresh_button.setEnabled(True)

            # Update folder label (show truncated path if too long)
            display_path = folder_path
            if len(display_path) > 50:
                display_path = "..." + display_path[-47:]
            self._folder_label.setText(display_path)
            self._folder_label.setToolTip(folder_path)

            # Populate tree
            self._populate_tree()

            self.folder_changed.emit(folder_path)

        except FileNotFoundError as e:
            QMessageBox.critical(self, "Folder Not Found", str(e))
        except NotADirectoryError as e:
            QMessageBox.critical(self, "Invalid Path", str(e))
        except Exception as e:
            QMessageBox.critical(self, "Error", f"Failed to load folder: {e}")

    def _refresh_files(self):
        """Refresh the file list from the current folder."""
        if self._current_folder:
            self.load_folder(self._current_folder)

    def _populate_tree(self):
        """Populate the tree widget based on available groups.

        Shows a 2-level hierarchy if target groups exist, otherwise a flat list.
        Custom groups are shown as separate sections.
        """
        self._file_tree.clear()

        if not self._files:
            self._count_label.setText("0 files found")
            return

        has_target_groups = (
            self._grouping_manager is not None
            and bool(self._grouping_manager.get_target_groups())
        )
        has_custom_groups = (
            self._grouping_manager is not None
            and bool(self._grouping_manager.get_custom_groups())
        )

        if has_target_groups or has_custom_groups:
            self._populate_grouped()
        else:
            self._populate_flat()

    def _populate_flat(self):
        """Populate tree as flat list (no grouping)."""
        for file_path in self._files:
            item = QTreeWidgetItem([file_path.name])
            item.setData(0, self.FILE_PATH_ROLE, str(file_path))
            item.setToolTip(0, str(file_path))
            self._file_tree.addTopLevelItem(item)

        # Update count label
        count = len(self._files)
        self._count_label.setText(f"{count} file{'s' if count != 1 else ''} found")

    def _populate_grouped(self):
        """Populate tree with 2-level target/binder hierarchy and custom groups."""
        grouped_paths: set[str] = set()

        # --- Target groups (with binder sub-groups) ---
        target_groups = self._grouping_manager.get_target_groups() if self._grouping_manager else []

        for group in target_groups:
            target_chains = group.metadata.get("target_chains", [])
            group_item = QTreeWidgetItem([f"{group.name}"])
            group_item.setExpanded(True)
            group_item.setToolTip(0, f"Target chains: {', '.join(target_chains)}")

            # Compute binder sub-groups
            subgroups = self._grouping_manager.compute_binder_subgroups(group)

            for subgroup in subgroups:
                if subgroup.count > 1:
                    # Multiple structures with same binder → create sub-group node
                    sub_item = QTreeWidgetItem([subgroup.name])
                    sub_item.setExpanded(True)
                    sub_item.setToolTip(0, f"Binder sequence: {subgroup.metadata.get('binder_preview', '')}")

                    for file_path in subgroup.members:
                        grouped_paths.add(file_path)
                        file_item = QTreeWidgetItem([Path(file_path).name])
                        file_item.setData(0, self.FILE_PATH_ROLE, file_path)
                        file_item.setToolTip(0, file_path)
                        sub_item.addChild(file_item)

                    group_item.addChild(sub_item)
                else:
                    # Single structure → add directly under target group
                    for file_path in subgroup.members:
                        grouped_paths.add(file_path)
                        file_item = QTreeWidgetItem([Path(file_path).name])
                        file_item.setData(0, self.FILE_PATH_ROLE, file_path)
                        file_item.setToolTip(0, file_path)
                        group_item.addChild(file_item)

            self._file_tree.addTopLevelItem(group_item)

        # --- Custom groups (from binder/chain search) ---
        custom_groups = self._grouping_manager.get_custom_groups() if self._grouping_manager else []

        for group in custom_groups:
            tooltip_parts = [f"Group: {group.name}"]
            if "source_chain" in group.metadata:
                tooltip_parts.append(f"Source chain: {group.metadata['source_chain']}")
            if "chain_length" in group.metadata:
                tooltip_parts.append(f"Chain length: {group.metadata['chain_length']} residues")
            if "sequence_preview" in group.metadata:
                tooltip_parts.append(f"Sequence: {group.metadata['sequence_preview']}")

            group_item = QTreeWidgetItem([f"{group.name} ({group.count} structures)"])
            group_item.setExpanded(True)
            group_item.setData(0, self.GROUP_ID_ROLE, group.id)
            group_item.setToolTip(0, "\n".join(tooltip_parts))

            for file_path in group.members:
                grouped_paths.add(file_path)
                file_item = QTreeWidgetItem([Path(file_path).name])
                file_item.setData(0, self.FILE_PATH_ROLE, file_path)
                file_item.setToolTip(0, file_path)
                group_item.addChild(file_item)

            self._file_tree.addTopLevelItem(group_item)

        # --- Ungrouped files ---
        ungrouped = [f for f in self._files if str(f) not in grouped_paths]
        if ungrouped:
            ungrouped_item = QTreeWidgetItem([f"Ungrouped ({len(ungrouped)} structures)"])
            ungrouped_item.setExpanded(False)

            for file_path in ungrouped:
                file_item = QTreeWidgetItem([file_path.name])
                file_item.setData(0, self.FILE_PATH_ROLE, str(file_path))
                file_item.setToolTip(0, str(file_path))
                ungrouped_item.addChild(file_item)

            self._file_tree.addTopLevelItem(ungrouped_item)

        # Update count
        total_groups = len(target_groups) + len(custom_groups)
        designated_count = len(grouped_paths)
        file_count = len(self._files)
        self._count_label.setText(
            f"{file_count} file{'s' if file_count != 1 else ''}, "
            f"{designated_count} grouped in {total_groups} group{'s' if total_groups != 1 else ''}"
        )

    def _on_item_clicked(self, item: QTreeWidgetItem, column: int):
        """Handle single click on a tree item."""
        # Single click just selects, doesn't load
        pass

    def _on_item_double_clicked(self, item: QTreeWidgetItem, column: int):
        """Handle double click on a tree item."""
        file_path = item.data(0, self.FILE_PATH_ROLE)
        if file_path:
            self.file_selected.emit(file_path)

    def get_selected_file(self) -> str | None:
        """Get the currently selected file path.

        Returns:
            The selected file path, or None if nothing is selected.
        """
        current_item = self._file_tree.currentItem()
        if current_item:
            return current_item.data(0, self.FILE_PATH_ROLE)
        return None

    def select_file(self, file_path: str) -> None:
        """Programmatically select a file in the tree.

        Args:
            file_path: Path to the file to select.
        """
        # Search recursively through tree
        def find_item(parent_item: QTreeWidgetItem | None = None) -> QTreeWidgetItem | None:
            if parent_item is None:
                # Search top-level items
                for i in range(self._file_tree.topLevelItemCount()):
                    item = self._file_tree.topLevelItem(i)
                    if item.data(0, self.FILE_PATH_ROLE) == file_path:
                        return item
                    # Check children
                    result = find_item(item)
                    if result:
                        return result
            else:
                # Search children
                for i in range(parent_item.childCount()):
                    child = parent_item.child(i)
                    if child.data(0, self.FILE_PATH_ROLE) == file_path:
                        return child
                    result = find_item(child)
                    if result:
                        return result
            return None

        item = find_item()
        if item:
            self._file_tree.setCurrentItem(item)
            self._file_tree.scrollToItem(item)

    @property
    def current_folder(self) -> str | None:
        """Get the current folder path."""
        return self._current_folder

    @property
    def file_count(self) -> int:
        """Get the number of files in the current folder."""
        return len(self._files)

    def get_all_file_paths(self) -> list[str]:
        """Get all file paths in the current folder.

        Returns:
            List of file path strings.
        """
        return [str(f) for f in self._files]

    def refresh_groups(self) -> None:
        """Refresh the tree display (call after groups are computed)."""
        self._populate_tree()
