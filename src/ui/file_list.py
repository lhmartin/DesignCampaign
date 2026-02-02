"""File list widget for browsing protein structure files."""

from pathlib import Path

from PyQt6.QtCore import pyqtSignal
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QPushButton,
    QListWidget,
    QListWidgetItem,
    QFileDialog,
    QLabel,
    QMessageBox,
)

from src.utils.file_utils import get_protein_files
from src.config.settings import SUPPORTED_FORMATS


class FileListWidget(QWidget):
    """Widget for selecting and listing protein structure files.

    Signals:
        file_selected: Emitted when a file is selected (with file path).
        folder_changed: Emitted when the folder is changed (with folder path).
    """

    file_selected = pyqtSignal(str)  # Emits the file path
    folder_changed = pyqtSignal(str)  # Emits the folder path

    def __init__(self, parent=None):
        """Initialize the file list widget.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self._current_folder: str | None = None
        self._files: list[Path] = []
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

        # File list
        self._file_list = QListWidget()
        self._file_list.setToolTip("Click to select a file, double-click to load")
        self._file_list.itemClicked.connect(self._on_item_clicked)
        self._file_list.itemDoubleClicked.connect(self._on_item_double_clicked)
        layout.addWidget(self._file_list, 1)  # Stretch factor 1 to fill space

        # Format info
        formats_str = ", ".join(f"*{fmt}" for fmt in SUPPORTED_FORMATS)
        info_label = QLabel(f"Supported formats: {formats_str}")
        info_label.setStyleSheet("QLabel { color: #999; font-size: 10px; }")
        layout.addWidget(info_label)

    def _on_open_folder(self):
        """Handle the open folder button click."""
        folder = QFileDialog.getExistingDirectory(
            self,
            "Select Folder with Protein Files",
            "",
            QFileDialog.Option.ShowDirsOnly,
        )
        if folder:
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

            # Populate list
            self._populate_list()

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

    def _populate_list(self):
        """Populate the file list widget with files."""
        self._file_list.clear()

        for file_path in self._files:
            item = QListWidgetItem(file_path.name)
            item.setData(256, str(file_path))  # Store full path in user role
            item.setToolTip(str(file_path))
            self._file_list.addItem(item)

        # Update count label
        count = len(self._files)
        self._count_label.setText(f"{count} file{'s' if count != 1 else ''} found")

    def _on_item_clicked(self, item: QListWidgetItem):
        """Handle single click on a list item."""
        # Single click just selects, doesn't load
        pass

    def _on_item_double_clicked(self, item: QListWidgetItem):
        """Handle double click on a list item."""
        file_path = item.data(256)
        if file_path:
            self.file_selected.emit(file_path)

    def get_selected_file(self) -> str | None:
        """Get the currently selected file path.

        Returns:
            The selected file path, or None if nothing is selected.
        """
        current_item = self._file_list.currentItem()
        if current_item:
            return current_item.data(256)
        return None

    def select_file(self, file_path: str) -> None:
        """Programmatically select a file in the list.

        Args:
            file_path: Path to the file to select.
        """
        for i in range(self._file_list.count()):
            item = self._file_list.item(i)
            if item.data(256) == file_path:
                self._file_list.setCurrentItem(item)
                break

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
