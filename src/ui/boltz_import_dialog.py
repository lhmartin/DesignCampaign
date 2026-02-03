"""Dialog for importing metrics from Boltz JSON files."""

from pathlib import Path
from typing import Any

from PyQt6.QtCore import Qt
from PyQt6.QtWidgets import (
    QDialog,
    QVBoxLayout,
    QHBoxLayout,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QPushButton,
    QGroupBox,
    QFileDialog,
    QMessageBox,
    QCheckBox,
    QTableWidget,
    QTableWidgetItem,
    QHeaderView,
    QDialogButtonBox,
    QAbstractItemView,
)

from src.models.metrics_store import (
    MetricsStore,
    BOLTZ_METRICS,
    DEFAULT_BOLTZ_METRICS,
)


class BoltzImportDialog(QDialog):
    """Dialog for selecting metrics to import from Boltz JSON files."""

    def __init__(
        self,
        parent=None,
        file_paths: list[str] | None = None,
        folder_path: str | None = None,
    ):
        """Initialize the dialog.

        Args:
            parent: Parent widget.
            file_paths: List of Boltz JSON file paths to import.
            folder_path: Folder containing Boltz JSON files to import.
        """
        super().__init__(parent)
        self._file_paths = file_paths or []
        self._folder_path = folder_path
        self._available_metrics: list[str] = []
        self._selected_metrics: list[str] = []
        self._preview_data: list[dict[str, Any]] = []

        self.setWindowTitle("Import Boltz JSON Metrics")
        self.setMinimumSize(600, 500)
        self._init_ui()
        self._scan_files()

    def _init_ui(self):
        """Initialize the UI components."""
        layout = QVBoxLayout(self)

        # Source info
        source_group = QGroupBox("Source")
        source_layout = QVBoxLayout(source_group)

        if self._folder_path:
            self._source_label = QLabel(f"Folder: {self._folder_path}")
        elif self._file_paths:
            if len(self._file_paths) == 1:
                self._source_label = QLabel(f"File: {self._file_paths[0]}")
            else:
                self._source_label = QLabel(f"Files: {len(self._file_paths)} selected")
        else:
            self._source_label = QLabel("No files selected")

        source_layout.addWidget(self._source_label)
        layout.addWidget(source_group)

        # Metrics selection
        metrics_group = QGroupBox("Select Metrics to Import")
        metrics_layout = QVBoxLayout(metrics_group)

        # Select all / none buttons
        btn_layout = QHBoxLayout()
        self._btn_select_all = QPushButton("Select All")
        self._btn_select_all.clicked.connect(self._select_all_metrics)
        btn_layout.addWidget(self._btn_select_all)

        self._btn_select_none = QPushButton("Select None")
        self._btn_select_none.clicked.connect(self._select_no_metrics)
        btn_layout.addWidget(self._btn_select_none)

        self._btn_select_defaults = QPushButton("Select Defaults")
        self._btn_select_defaults.clicked.connect(self._select_default_metrics)
        btn_layout.addWidget(self._btn_select_defaults)

        btn_layout.addStretch()
        metrics_layout.addLayout(btn_layout)

        # Metrics list with checkboxes
        self._metrics_list = QListWidget()
        self._metrics_list.setSelectionMode(QAbstractItemView.SelectionMode.NoSelection)
        metrics_layout.addWidget(self._metrics_list)

        layout.addWidget(metrics_group)

        # Preview table
        preview_group = QGroupBox("Preview (first 5 proteins)")
        preview_layout = QVBoxLayout(preview_group)

        self._preview_table = QTableWidget()
        self._preview_table.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self._preview_table.horizontalHeader().setStretchLastSection(True)
        preview_layout.addWidget(self._preview_table)

        layout.addWidget(preview_group)

        # Dialog buttons
        button_box = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        button_box.accepted.connect(self.accept)
        button_box.rejected.connect(self.reject)
        layout.addWidget(button_box)

    def _scan_files(self):
        """Scan files to detect available metrics."""
        # Collect all files to scan
        files_to_scan = []

        if self._folder_path:
            folder = Path(self._folder_path)
            files_to_scan = list(folder.glob("*.json"))
        elif self._file_paths:
            files_to_scan = [Path(p) for p in self._file_paths]

        if not files_to_scan:
            return

        # Detect available metrics from first valid file
        all_metrics = set()
        self._preview_data = []

        for file_path in files_to_scan[:20]:  # Check up to 20 files
            metrics = MetricsStore.detect_boltz_metrics(file_path)
            if metrics:
                all_metrics.update(metrics)
                # Load preview data
                if len(self._preview_data) < 5:
                    self._load_preview_data(file_path)

        self._available_metrics = sorted(all_metrics)
        self._populate_metrics_list()
        self._update_preview()

        # Update source label with file count
        if self._folder_path:
            boltz_count = sum(
                1 for f in Path(self._folder_path).glob("*.json")
                if MetricsStore.detect_boltz_metrics(f)
            )
            self._source_label.setText(
                f"Folder: {self._folder_path} ({boltz_count} Boltz JSON files)"
            )

    def _load_preview_data(self, file_path: Path):
        """Load preview data from a file."""
        import json

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if isinstance(data, dict) and "sequence_name" in data:
                preview = {"name": data.get("sequence_name", file_path.stem)}
                for metric in BOLTZ_METRICS:
                    if metric in data and isinstance(data[metric], (int, float)):
                        preview[metric] = data[metric]

                # Add chain-specific PTM
                chains_ptm = data.get("chains_ptm", {})
                if isinstance(chains_ptm, dict):
                    for chain_id, value in chains_ptm.items():
                        if isinstance(value, (int, float)):
                            preview[f"ptm_chain_{chain_id}"] = value

                self._preview_data.append(preview)
        except (json.JSONDecodeError, IOError):
            pass

    def _populate_metrics_list(self):
        """Populate the metrics list with checkboxes."""
        self._metrics_list.clear()

        for metric_name in self._available_metrics:
            item = QListWidgetItem()
            checkbox = QCheckBox()

            # Get description if available
            description = BOLTZ_METRICS.get(metric_name, "")
            if description:
                checkbox.setText(f"{metric_name} - {description}")
            else:
                checkbox.setText(metric_name)

            # Check if default metric
            checkbox.setChecked(metric_name in DEFAULT_BOLTZ_METRICS)
            checkbox.stateChanged.connect(self._update_preview)

            self._metrics_list.addItem(item)
            self._metrics_list.setItemWidget(item, checkbox)
            item.setSizeHint(checkbox.sizeHint())

    def _get_selected_metrics(self) -> list[str]:
        """Get list of currently selected metrics."""
        selected = []
        for i in range(self._metrics_list.count()):
            item = self._metrics_list.item(i)
            checkbox = self._metrics_list.itemWidget(item)
            if isinstance(checkbox, QCheckBox) and checkbox.isChecked():
                # Extract metric name (before " - ")
                text = checkbox.text()
                if " - " in text:
                    metric_name = text.split(" - ")[0]
                else:
                    metric_name = text
                selected.append(metric_name)
        return selected

    def _select_all_metrics(self):
        """Select all metrics."""
        for i in range(self._metrics_list.count()):
            item = self._metrics_list.item(i)
            checkbox = self._metrics_list.itemWidget(item)
            if isinstance(checkbox, QCheckBox):
                checkbox.setChecked(True)

    def _select_no_metrics(self):
        """Deselect all metrics."""
        for i in range(self._metrics_list.count()):
            item = self._metrics_list.item(i)
            checkbox = self._metrics_list.itemWidget(item)
            if isinstance(checkbox, QCheckBox):
                checkbox.setChecked(False)

    def _select_default_metrics(self):
        """Select only default metrics."""
        for i in range(self._metrics_list.count()):
            item = self._metrics_list.item(i)
            checkbox = self._metrics_list.itemWidget(item)
            if isinstance(checkbox, QCheckBox):
                text = checkbox.text()
                if " - " in text:
                    metric_name = text.split(" - ")[0]
                else:
                    metric_name = text
                checkbox.setChecked(metric_name in DEFAULT_BOLTZ_METRICS)

    def _update_preview(self):
        """Update the preview table."""
        selected_metrics = self._get_selected_metrics()

        if not self._preview_data or not selected_metrics:
            self._preview_table.clear()
            self._preview_table.setRowCount(0)
            self._preview_table.setColumnCount(0)
            return

        # Set up columns
        columns = ["Name"] + selected_metrics
        self._preview_table.setColumnCount(len(columns))
        self._preview_table.setHorizontalHeaderLabels(columns)

        # Populate rows
        self._preview_table.setRowCount(len(self._preview_data))
        for row, data in enumerate(self._preview_data):
            # Name column
            self._preview_table.setItem(row, 0, QTableWidgetItem(data.get("name", "")))

            # Metric columns
            for col, metric in enumerate(selected_metrics, start=1):
                value = data.get(metric)
                if value is not None:
                    self._preview_table.setItem(
                        row, col, QTableWidgetItem(f"{value:.4f}")
                    )
                else:
                    self._preview_table.setItem(row, col, QTableWidgetItem(""))

        # Resize columns
        self._preview_table.horizontalHeader().setSectionResizeMode(
            0, QHeaderView.ResizeMode.ResizeToContents
        )
        for col in range(1, len(columns)):
            self._preview_table.horizontalHeader().setSectionResizeMode(
                col, QHeaderView.ResizeMode.Stretch
            )

    def get_selected_metrics(self) -> list[str]:
        """Get the metrics selected by the user.

        Returns:
            List of metric names to import.
        """
        return self._get_selected_metrics()

    def get_file_paths(self) -> list[str]:
        """Get the file paths to import from.

        Returns:
            List of file paths.
        """
        if self._folder_path:
            folder = Path(self._folder_path)
            return [
                str(f) for f in folder.glob("*.json")
                if MetricsStore.detect_boltz_metrics(f)
            ]
        return self._file_paths

    @property
    def folder_path(self) -> str | None:
        """Get the folder path if importing from folder."""
        return self._folder_path
