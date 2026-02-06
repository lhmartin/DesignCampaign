"""Metrics table widget for displaying protein metrics with sorting and filtering."""

from typing import Any

from PyQt6.QtCore import (
    Qt,
    QAbstractTableModel,
    QModelIndex,
    QSortFilterProxyModel,
    pyqtSignal,
)
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QTableView,
    QHeaderView,
    QLineEdit,
    QLabel,
    QPushButton,
    QComboBox,
    QDoubleSpinBox,
    QGroupBox,
    QCheckBox,
    QAbstractItemView,
)
from PyQt6.QtGui import QColor

from src.models.metrics_store import MetricsStore, ProteinMetrics


class MetricsTableModel(QAbstractTableModel):
    """Table model for protein metrics data."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._store: MetricsStore = MetricsStore()
        self._proteins: list[ProteinMetrics] = []
        self._metric_columns: list[str] = []

    def set_store(self, store: MetricsStore) -> None:
        """Set the metrics store and refresh the model.

        Args:
            store: MetricsStore instance.
        """
        self.beginResetModel()
        self._store = store
        self._proteins = list(store)
        self._metric_columns = store.metric_names
        self.endResetModel()

    def refresh(self) -> None:
        """Refresh data from the store."""
        self.beginResetModel()
        self._proteins = list(self._store)
        self._metric_columns = self._store.metric_names
        self.endResetModel()

    def rowCount(self, parent: QModelIndex = QModelIndex()) -> int:
        if parent.isValid():
            return 0
        return len(self._proteins)

    def columnCount(self, parent: QModelIndex = QModelIndex()) -> int:
        if parent.isValid():
            return 0
        # Name column + metric columns
        return 1 + len(self._metric_columns)

    def data(self, index: QModelIndex, role: int = Qt.ItemDataRole.DisplayRole) -> Any:
        if not index.isValid():
            return None

        row = index.row()
        col = index.column()

        if row < 0 or row >= len(self._proteins):
            return None

        protein = self._proteins[row]

        if role == Qt.ItemDataRole.DisplayRole:
            if col == 0:
                return protein.name
            else:
                metric_name = self._metric_columns[col - 1]
                value = protein.get_metric(metric_name)
                if value is not None:
                    return f"{value:.4f}"
                return ""

        elif role == Qt.ItemDataRole.TextAlignmentRole:
            if col == 0:
                return Qt.AlignmentFlag.AlignLeft | Qt.AlignmentFlag.AlignVCenter
            return Qt.AlignmentFlag.AlignRight | Qt.AlignmentFlag.AlignVCenter

        elif role == Qt.ItemDataRole.UserRole:
            # Return raw value for sorting
            if col == 0:
                return protein.name.lower()
            else:
                metric_name = self._metric_columns[col - 1]
                value = protein.get_metric(metric_name)
                # Return large number for None to sort at end
                return value if value is not None else float("inf")

        elif role == Qt.ItemDataRole.BackgroundRole:
            # Alternate row colors
            if row % 2 == 1:
                return QColor(248, 248, 248)

        return None

    def headerData(
        self,
        section: int,
        orientation: Qt.Orientation,
        role: int = Qt.ItemDataRole.DisplayRole,
    ) -> Any:
        if role != Qt.ItemDataRole.DisplayRole:
            return None

        if orientation == Qt.Orientation.Horizontal:
            if section == 0:
                return "Protein"
            elif section - 1 < len(self._metric_columns):
                return self._metric_columns[section - 1]

        return None

    def get_protein_at_row(self, row: int) -> ProteinMetrics | None:
        """Get the protein at a specific row.

        Args:
            row: Row index.

        Returns:
            ProteinMetrics or None.
        """
        if 0 <= row < len(self._proteins):
            return self._proteins[row]
        return None

    def get_column_name(self, col: int) -> str | None:
        """Get the column name.

        Args:
            col: Column index.

        Returns:
            Column name or None.
        """
        if col == 0:
            return "name"
        elif 1 <= col <= len(self._metric_columns):
            return self._metric_columns[col - 1]
        return None


class MetricsSortFilterModel(QSortFilterProxyModel):
    """Proxy model for filtering and sorting metrics table."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._name_filter: str = ""
        self._metric_filters: dict[str, tuple[float | None, float | None]] = {}

    def set_name_filter(self, pattern: str) -> None:
        """Set the name filter pattern.

        Args:
            pattern: Search pattern (case-insensitive contains).
        """
        self._name_filter = pattern.lower()
        self.invalidateFilter()

    def set_metric_filter(
        self,
        metric_name: str,
        min_val: float | None,
        max_val: float | None,
    ) -> None:
        """Set a filter for a specific metric.

        Args:
            metric_name: Name of the metric.
            min_val: Minimum value (inclusive) or None.
            max_val: Maximum value (inclusive) or None.
        """
        if min_val is None and max_val is None:
            self._metric_filters.pop(metric_name, None)
        else:
            self._metric_filters[metric_name] = (min_val, max_val)
        self.invalidateFilter()

    def clear_filters(self) -> None:
        """Clear all filters."""
        self._name_filter = ""
        self._metric_filters.clear()
        self.invalidateFilter()

    def filterAcceptsRow(
        self,
        source_row: int,
        source_parent: QModelIndex,
    ) -> bool:
        source_model = self.sourceModel()
        if not isinstance(source_model, MetricsTableModel):
            return True

        protein = source_model.get_protein_at_row(source_row)
        if protein is None:
            return False

        # Check name filter
        if self._name_filter and self._name_filter not in protein.name.lower():
            return False

        # Check metric filters
        for metric_name, (min_val, max_val) in self._metric_filters.items():
            value = protein.get_metric(metric_name)
            if value is None:
                return False
            if min_val is not None and value < min_val:
                return False
            if max_val is not None and value > max_val:
                return False

        return True

    def lessThan(self, left: QModelIndex, right: QModelIndex) -> bool:
        left_data = self.sourceModel().data(left, Qt.ItemDataRole.UserRole)
        right_data = self.sourceModel().data(right, Qt.ItemDataRole.UserRole)

        if left_data is None:
            return False
        if right_data is None:
            return True

        return left_data < right_data


class FilterWidget(QWidget):
    """Widget for metric range filtering."""

    filter_changed = pyqtSignal(str, object, object)  # metric_name, min, max

    def __init__(self, metric_name: str, parent=None):
        super().__init__(parent)
        self._metric_name = metric_name
        self._enabled = False
        self._init_ui()

    def _init_ui(self):
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(4)

        # Enable checkbox
        self._checkbox = QCheckBox()
        self._checkbox.setToolTip(f"Enable filter for {self._metric_name}")
        self._checkbox.stateChanged.connect(self._on_enabled_changed)
        layout.addWidget(self._checkbox)

        # Metric name label
        self._label = QLabel(f"{self._metric_name}:")
        layout.addWidget(self._label)

        # Min value
        self._min_spin = QDoubleSpinBox()
        self._min_spin.setRange(-1e9, 1e9)
        self._min_spin.setDecimals(4)
        self._min_spin.setValue(0)
        self._min_spin.setEnabled(False)
        self._min_spin.setFixedWidth(80)
        self._min_spin.valueChanged.connect(self._on_value_changed)
        layout.addWidget(self._min_spin)

        layout.addWidget(QLabel("to"))

        # Max value
        self._max_spin = QDoubleSpinBox()
        self._max_spin.setRange(-1e9, 1e9)
        self._max_spin.setDecimals(4)
        self._max_spin.setValue(1)
        self._max_spin.setEnabled(False)
        self._max_spin.setFixedWidth(80)
        self._max_spin.valueChanged.connect(self._on_value_changed)
        layout.addWidget(self._max_spin)

        layout.addStretch()

    def _on_enabled_changed(self, state: int) -> None:
        self._enabled = state == Qt.CheckState.Checked.value
        self._min_spin.setEnabled(self._enabled)
        self._max_spin.setEnabled(self._enabled)
        self._emit_filter()

    def _on_value_changed(self) -> None:
        if self._enabled:
            self._emit_filter()

    def _emit_filter(self) -> None:
        if self._enabled:
            self.filter_changed.emit(
                self._metric_name,
                self._min_spin.value(),
                self._max_spin.value(),
            )
        else:
            self.filter_changed.emit(self._metric_name, None, None)

    def set_range(self, min_val: float, max_val: float) -> None:
        """Set the suggested range for this filter.

        Args:
            min_val: Minimum value.
            max_val: Maximum value.
        """
        self._min_spin.setValue(min_val)
        self._max_spin.setValue(max_val)

    def reset(self) -> None:
        """Reset the filter to disabled state."""
        self._checkbox.setChecked(False)
        self._enabled = False
        self._min_spin.setEnabled(False)
        self._max_spin.setEnabled(False)

    def set_label_width(self, width: int) -> None:
        """Set the label width for alignment.

        Args:
            width: Width in pixels.
        """
        self._label.setFixedWidth(width)

    def get_label_width_hint(self) -> int:
        """Get the preferred width for the label based on text.

        Returns:
            Width in pixels needed to display the label text.
        """
        return self._label.fontMetrics().boundingRect(self._label.text()).width() + 10


class MetricsTableWidget(QWidget):
    """Widget displaying protein metrics in a sortable, filterable table.

    Signals:
        protein_selected: Emitted when a protein is selected (protein name).
        protein_double_clicked: Emitted when a protein is double-clicked.
        filters_changed: Emitted when metric filters change (dict of metric_name -> (min, max)).
    """

    protein_selected = pyqtSignal(str)  # protein name
    protein_double_clicked = pyqtSignal(str)  # protein name
    filters_changed = pyqtSignal(dict)  # {metric_name: (min_val, max_val), ...}

    def __init__(self, parent=None):
        super().__init__(parent)
        self._store = MetricsStore()
        self._filter_widgets: dict[str, FilterWidget] = {}
        self._init_ui()

    def _init_ui(self):
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(8)

        # Filter section
        filter_group = QGroupBox("Filters")
        filter_layout = QVBoxLayout(filter_group)
        filter_layout.setSpacing(4)

        # Metric filter search
        search_layout = QHBoxLayout()
        search_layout.addWidget(QLabel("Search:"))
        self._filter_search_input = QLineEdit()
        self._filter_search_input.setPlaceholderText("Search metrics...")
        self._filter_search_input.textChanged.connect(self._on_filter_search_changed)
        search_layout.addWidget(self._filter_search_input)

        self._clear_filters_btn = QPushButton("Clear Filters")
        self._clear_filters_btn.clicked.connect(self._on_clear_filters)
        search_layout.addWidget(self._clear_filters_btn)

        filter_layout.addLayout(search_layout)

        # Metric filters container
        self._metric_filters_layout = QVBoxLayout()
        filter_layout.addLayout(self._metric_filters_layout)

        layout.addWidget(filter_group)

        # Table
        self._model = MetricsTableModel(self)
        self._proxy_model = MetricsSortFilterModel(self)
        self._proxy_model.setSourceModel(self._model)
        self._proxy_model.setSortRole(Qt.ItemDataRole.UserRole)

        self._table = QTableView()
        self._table.setModel(self._proxy_model)
        self._table.setSortingEnabled(True)
        self._table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self._table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self._table.setAlternatingRowColors(True)
        self._table.verticalHeader().setVisible(False)
        self._table.horizontalHeader().setStretchLastSection(True)
        self._table.horizontalHeader().setSectionResizeMode(
            QHeaderView.ResizeMode.Interactive
        )

        # Connect signals
        self._table.selectionModel().currentChanged.connect(self._on_selection_changed)
        self._table.doubleClicked.connect(self._on_double_clicked)

        layout.addWidget(self._table, 1)

        # Status bar
        self._status_label = QLabel("No data loaded")
        self._status_label.setStyleSheet("color: #666;")
        layout.addWidget(self._status_label)

    def set_store(self, store: MetricsStore) -> None:
        """Set the metrics store.

        Args:
            store: MetricsStore instance.
        """
        self._store = store
        self._model.set_store(store)
        self._update_metric_filters()
        self._update_status()

    def refresh(self) -> None:
        """Refresh the table data."""
        self._model.refresh()
        self._update_metric_filters()
        self._update_status()

    def _update_metric_filters(self) -> None:
        """Update metric filter widgets based on available metrics."""
        # Clear existing filters
        for widget in self._filter_widgets.values():
            self._metric_filters_layout.removeWidget(widget)
            widget.deleteLater()
        self._filter_widgets.clear()

        # Add filters for each metric
        for metric_name in self._store.metric_names:
            widget = FilterWidget(metric_name, self)
            widget.filter_changed.connect(self._on_metric_filter_changed)

            # Set suggested range from data
            stats = self._store.get_metric_stats(metric_name)
            if stats["min"] is not None and stats["max"] is not None:
                widget.set_range(stats["min"], stats["max"])

            self._filter_widgets[metric_name] = widget
            self._metric_filters_layout.addWidget(widget)

        # Calculate max label width and apply to all widgets for alignment
        if self._filter_widgets:
            max_width = max(w.get_label_width_hint() for w in self._filter_widgets.values())
            for widget in self._filter_widgets.values():
                widget.set_label_width(max_width)

    def _update_status(self) -> None:
        """Update the status label."""
        visible = self._proxy_model.rowCount()
        total = self._model.rowCount()
        if total == 0:
            self._status_label.setText("No data loaded")
        elif visible == total:
            self._status_label.setText(f"{total} proteins")
        else:
            self._status_label.setText(f"Showing {visible} of {total} proteins")

    def _on_filter_search_changed(self, text: str) -> None:
        """Filter which metric filter widgets are visible based on search text."""
        search_lower = text.lower()
        for metric_name, widget in self._filter_widgets.items():
            # Show widget if search is empty or metric name contains search text
            visible = not search_lower or search_lower in metric_name.lower()
            widget.setVisible(visible)

    def _on_metric_filter_changed(
        self,
        metric_name: str,
        min_val: float | None,
        max_val: float | None,
    ) -> None:
        self._proxy_model.set_metric_filter(metric_name, min_val, max_val)
        self._update_status()
        self._emit_filters()

    def _on_clear_filters(self) -> None:
        self._filter_search_input.clear()
        for widget in self._filter_widgets.values():
            widget.reset()
            widget.setVisible(True)  # Show all widgets when clearing
        self._proxy_model.clear_filters()
        self._update_status()
        self._emit_filters()

    def _emit_filters(self) -> None:
        """Emit the current filter state."""
        self.filters_changed.emit(self._proxy_model._metric_filters.copy())

    def _on_selection_changed(self, current: QModelIndex, previous: QModelIndex) -> None:
        if not current.isValid():
            return

        source_index = self._proxy_model.mapToSource(current)
        protein = self._model.get_protein_at_row(source_index.row())
        if protein:
            self.protein_selected.emit(protein.name)

    def _on_double_clicked(self, index: QModelIndex) -> None:
        if not index.isValid():
            return

        source_index = self._proxy_model.mapToSource(index)
        protein = self._model.get_protein_at_row(source_index.row())
        if protein:
            self.protein_double_clicked.emit(protein.name)

    def get_selected_protein(self) -> str | None:
        """Get the currently selected protein name.

        Returns:
            Protein name or None.
        """
        indexes = self._table.selectionModel().selectedRows()
        if not indexes:
            return None

        source_index = self._proxy_model.mapToSource(indexes[0])
        protein = self._model.get_protein_at_row(source_index.row())
        return protein.name if protein else None

    def get_filtered_protein_names(self) -> list[str]:
        """Get names of all proteins currently passing filters.

        Returns:
            List of protein names visible in the filtered table.
        """
        names = []
        for row in range(self._proxy_model.rowCount()):
            index = self._proxy_model.index(row, 0)
            source_index = self._proxy_model.mapToSource(index)
            protein = self._model.get_protein_at_row(source_index.row())
            if protein:
                names.append(protein.name)
        return names

    def select_protein(self, name: str) -> bool:
        """Select a protein by name.

        Args:
            name: Protein name.

        Returns:
            True if found and selected.
        """
        for row in range(self._proxy_model.rowCount()):
            index = self._proxy_model.index(row, 0)
            source_index = self._proxy_model.mapToSource(index)
            protein = self._model.get_protein_at_row(source_index.row())
            if protein and protein.name == name:
                self._table.selectRow(row)
                return True
        return False
