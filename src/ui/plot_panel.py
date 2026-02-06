"""Plotting panel for visualizing protein metrics."""

import numpy as np
import pyqtgraph as pg
from PyQt6.QtCore import pyqtSignal, Qt
from PyQt6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFileDialog,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QStackedWidget,
    QVBoxLayout,
    QWidget,
)

from src.models.metrics_store import MetricsStore
from src.config.settings import Theme
from src.config.theme_manager import get_theme_manager


class ScatterPlotWidget(QWidget):
    """Interactive scatter plot for comparing two metrics.

    Signals:
        point_clicked: Emitted when a data point is clicked (protein name).
    """

    point_clicked = pyqtSignal(str)

    def __init__(self, parent=None):
        """Initialize the scatter plot widget."""
        super().__init__(parent)
        self._protein_data: list[dict] = []  # [{name, file_path, x, y}, ...]
        self._scatter_item: pg.ScatterPlotItem | None = None
        self._filter_lines: list = []  # Store filter line items
        self._x_metric: str = ""
        self._y_metric: str = ""
        self._filters: dict[str, tuple[float | None, float | None]] = {}
        self._theme_connected: bool = False
        self._init_ui()

    def showEvent(self, event):
        """Connect to theme manager when widget is first shown."""
        super().showEvent(event)
        if not self._theme_connected:
            self._theme_connected = True
            get_theme_manager().add_listener(self.apply_theme)
            self.apply_theme(get_theme_manager().current_theme)

    def _init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        # Create plot widget
        self._plot_widget = pg.PlotWidget()
        self._plot_widget.setBackground("w")
        self._plot_widget.showGrid(x=True, y=True, alpha=0.3)

        # Configure axes to show actual values (not scaled) with 2 decimal places
        for axis_name in ["bottom", "left"]:
            axis = self._plot_widget.getAxis(axis_name)
            axis.setStyle(autoReduceTextSpace=False)
            axis.enableAutoSIPrefix(False)
            axis.tickStrings = lambda values, scale, spacing: [f"{v:.2f}" for v in values]

        layout.addWidget(self._plot_widget)

    def apply_theme(self, theme: Theme) -> None:
        """Apply theme colors to the plot.

        Args:
            theme: Theme to apply.
        """
        self._plot_widget.setBackground(theme.plot_background)
        for axis_name in ["bottom", "left"]:
            axis = self._plot_widget.getAxis(axis_name)
            axis.setPen(pg.mkPen(theme.plot_foreground))
            axis.setTextPen(pg.mkPen(theme.plot_foreground))

    def set_data(
        self,
        x_values: list[float],
        y_values: list[float],
        names: list[str],
        file_paths: list[str | None],
    ) -> None:
        """Set the scatter plot data.

        Args:
            x_values: X-axis values.
            y_values: Y-axis values.
            names: Protein names (same order).
            file_paths: File paths (same order).
        """
        self.clear()

        if not x_values or not y_values:
            return

        # Store protein data for click handling
        self._protein_data = [
            {"name": name, "file_path": fp, "x": x, "y": y}
            for name, fp, x, y in zip(names, file_paths, x_values, y_values)
        ]

        # Create spots with data attached
        spots = [
            {
                "pos": (x, y),
                "data": {"name": name, "file_path": fp},
                "brush": pg.mkBrush(100, 100, 255, 180),
                "pen": pg.mkPen("b", width=1),
                "size": 10,
            }
            for x, y, name, fp in zip(x_values, y_values, names, file_paths)
        ]

        self._scatter_item = pg.ScatterPlotItem(
            hoverable=True,
            hoverPen=pg.mkPen("r", width=2),
            hoverBrush=pg.mkBrush(255, 100, 100, 220),
            hoverSize=14,
        )
        self._scatter_item.setData(spots)
        self._scatter_item.sigClicked.connect(self._on_scatter_clicked)

        self._plot_widget.addItem(self._scatter_item)
        self._plot_widget.autoRange()

    def set_axis_labels(self, x_label: str, y_label: str) -> None:
        """Set axis labels.

        Args:
            x_label: Label for X-axis.
            y_label: Label for Y-axis.
        """
        self._x_metric = x_label
        self._y_metric = y_label
        self._plot_widget.setLabel("bottom", x_label)
        self._plot_widget.setLabel("left", y_label)
        # Update filter lines with new metric context
        self._update_filter_lines()

    def clear(self) -> None:
        """Clear the plot."""
        self._plot_widget.clear()
        self._scatter_item = None
        self._protein_data = []
        self._filter_lines = []

    def set_filters(self, filters: dict[str, tuple[float | None, float | None]]) -> None:
        """Set the current metric filters.

        Args:
            filters: Dict of metric_name -> (min_val, max_val).
        """
        self._filters = filters.copy()
        self._update_filter_lines()

    def _update_filter_lines(self) -> None:
        """Draw filter threshold lines on the plot."""
        # Remove existing filter lines
        for line in self._filter_lines:
            self._plot_widget.removeItem(line)
        self._filter_lines = []

        if not self._protein_data:
            return

        # Get data range for extending lines
        x_vals = [d["x"] for d in self._protein_data]
        y_vals = [d["y"] for d in self._protein_data]
        x_min, x_max = min(x_vals), max(x_vals)
        y_min, y_max = min(y_vals), max(y_vals)

        # Add margin to line extent
        x_margin = (x_max - x_min) * 0.1 if x_max != x_min else 0.1
        y_margin = (y_max - y_min) * 0.1 if y_max != y_min else 0.1

        filter_pen = pg.mkPen(color=(255, 100, 100, 200), width=2, style=Qt.PenStyle.DashLine)

        # Draw X-axis filter lines (vertical lines)
        if self._x_metric in self._filters:
            min_val, max_val = self._filters[self._x_metric]
            if min_val is not None:
                line = pg.InfiniteLine(pos=min_val, angle=90, pen=filter_pen)
                self._plot_widget.addItem(line)
                self._filter_lines.append(line)
            if max_val is not None:
                line = pg.InfiniteLine(pos=max_val, angle=90, pen=filter_pen)
                self._plot_widget.addItem(line)
                self._filter_lines.append(line)

        # Draw Y-axis filter lines (horizontal lines)
        if self._y_metric in self._filters:
            min_val, max_val = self._filters[self._y_metric]
            if min_val is not None:
                line = pg.InfiniteLine(pos=min_val, angle=0, pen=filter_pen)
                self._plot_widget.addItem(line)
                self._filter_lines.append(line)
            if max_val is not None:
                line = pg.InfiniteLine(pos=max_val, angle=0, pen=filter_pen)
                self._plot_widget.addItem(line)
                self._filter_lines.append(line)

    def highlight_point(self, name: str) -> None:
        """Highlight a specific point by protein name.

        Args:
            name: Protein name to highlight.
        """
        if not self._scatter_item:
            return

        # Find the point and update its appearance
        for i, data in enumerate(self._protein_data):
            if data["name"] == name:
                # Could implement highlight logic here
                break

    def _on_scatter_clicked(self, plot, points, ev):
        """Handle click on scatter points."""
        if points:
            point = points[0]
            data = point.data()
            if data and "name" in data:
                self.point_clicked.emit(data["name"])


class BoxPlotWidget(QWidget):
    """Box plot for showing distribution of a single metric."""

    def __init__(self, parent=None):
        """Initialize the box plot widget."""
        super().__init__(parent)
        self._metric_name: str = ""
        self._filters: dict[str, tuple[float | None, float | None]] = {}
        self._filter_lines: list = []
        self._has_data: bool = False
        self._theme_connected: bool = False
        self._init_ui()

    def showEvent(self, event):
        """Connect to theme manager when widget is first shown."""
        super().showEvent(event)
        if not self._theme_connected:
            self._theme_connected = True
            get_theme_manager().add_listener(self.apply_theme)
            self.apply_theme(get_theme_manager().current_theme)

    def _init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)

        self._plot_widget = pg.PlotWidget()
        self._plot_widget.setBackground("w")
        self._plot_widget.showGrid(x=False, y=True, alpha=0.3)

        # Configure Y-axis to show actual values with 2 decimal places
        y_axis = self._plot_widget.getAxis("left")
        y_axis.setStyle(autoReduceTextSpace=False)
        y_axis.enableAutoSIPrefix(False)
        y_axis.tickStrings = lambda values, scale, spacing: [f"{v:.2f}" for v in values]

        layout.addWidget(self._plot_widget)

    def set_data(self, values: list[float], metric_name: str) -> None:
        """Create a box plot from values.

        Args:
            values: List of metric values.
            metric_name: Name of the metric (for label).
        """
        self.clear()
        self._metric_name = metric_name

        if not values or len(values) < 2:
            self._has_data = False
            return

        self._has_data = True

        arr = np.array(values)
        q1, median, q3 = np.percentile(arr, [25, 50, 75])
        iqr = q3 - q1
        whisker_low = max(arr.min(), q1 - 1.5 * iqr)
        whisker_high = min(arr.max(), q3 + 1.5 * iqr)

        # Find outliers
        outliers = arr[(arr < whisker_low) | (arr > whisker_high)]

        # Box position
        x_pos = 0.5

        # Draw box (q1 to q3)
        box_width = 0.3
        box = pg.BarGraphItem(
            x=[x_pos],
            height=[q3 - q1],
            width=box_width,
            y0=[q1],
            brush=pg.mkBrush(100, 150, 255, 150),
            pen=pg.mkPen("b", width=2),
        )
        self._plot_widget.addItem(box)

        # Draw median line
        median_line = pg.PlotDataItem(
            x=[x_pos - box_width / 2, x_pos + box_width / 2],
            y=[median, median],
            pen=pg.mkPen("r", width=3),
        )
        self._plot_widget.addItem(median_line)

        # Draw whiskers
        whisker_pen = pg.mkPen("b", width=2)

        # Lower whisker
        lower_whisker = pg.PlotDataItem(
            x=[x_pos, x_pos], y=[whisker_low, q1], pen=whisker_pen
        )
        self._plot_widget.addItem(lower_whisker)

        # Lower whisker cap
        lower_cap = pg.PlotDataItem(
            x=[x_pos - box_width / 4, x_pos + box_width / 4],
            y=[whisker_low, whisker_low],
            pen=whisker_pen,
        )
        self._plot_widget.addItem(lower_cap)

        # Upper whisker
        upper_whisker = pg.PlotDataItem(
            x=[x_pos, x_pos], y=[q3, whisker_high], pen=whisker_pen
        )
        self._plot_widget.addItem(upper_whisker)

        # Upper whisker cap
        upper_cap = pg.PlotDataItem(
            x=[x_pos - box_width / 4, x_pos + box_width / 4],
            y=[whisker_high, whisker_high],
            pen=whisker_pen,
        )
        self._plot_widget.addItem(upper_cap)

        # Draw outliers
        if len(outliers) > 0:
            outlier_scatter = pg.ScatterPlotItem(
                x=[x_pos] * len(outliers),
                y=outliers,
                pen=pg.mkPen("b", width=1),
                brush=pg.mkBrush(255, 255, 255, 200),
                size=8,
                symbol="o",
            )
            self._plot_widget.addItem(outlier_scatter)

        # Set axis
        self._plot_widget.setLabel("left", metric_name)
        self._plot_widget.setXRange(0, 1)
        self._plot_widget.getAxis("bottom").setTicks([])

        # Add stats text
        stats_text = (
            f"n={len(values)}, median={median:.2f}, "
            f"Q1={q1:.2f}, Q3={q3:.2f}"
        )
        text_item = pg.TextItem(stats_text, anchor=(0.5, 0), color="k")
        text_item.setPos(x_pos, whisker_high + (whisker_high - whisker_low) * 0.1)
        self._plot_widget.addItem(text_item)

        # Update filter lines
        self._update_filter_lines()

    def clear(self) -> None:
        """Clear the plot."""
        self._plot_widget.clear()
        self._filter_lines = []
        self._has_data = False

    def set_filters(self, filters: dict[str, tuple[float | None, float | None]]) -> None:
        """Set the current metric filters.

        Args:
            filters: Dict of metric_name -> (min_val, max_val).
        """
        self._filters = filters.copy()
        self._update_filter_lines()

    def _update_filter_lines(self) -> None:
        """Draw filter threshold lines on the plot."""
        # Remove existing filter lines
        for line in self._filter_lines:
            self._plot_widget.removeItem(line)
        self._filter_lines = []

        if not self._has_data or not self._metric_name:
            return

        # Check if the current metric has a filter
        if self._metric_name not in self._filters:
            return

        filter_pen = pg.mkPen(color=(255, 100, 100, 200), width=2, style=Qt.PenStyle.DashLine)
        min_val, max_val = self._filters[self._metric_name]

        # Draw horizontal filter lines for the Y-axis (box plot shows metric on Y)
        if min_val is not None:
            line = pg.InfiniteLine(pos=min_val, angle=0, pen=filter_pen)
            self._plot_widget.addItem(line)
            self._filter_lines.append(line)
        if max_val is not None:
            line = pg.InfiniteLine(pos=max_val, angle=0, pen=filter_pen)
            self._plot_widget.addItem(line)
            self._filter_lines.append(line)

    def apply_theme(self, theme: Theme) -> None:
        """Apply theme colors to the plot.

        Args:
            theme: Theme to apply.
        """
        self._plot_widget.setBackground(theme.plot_background)
        y_axis = self._plot_widget.getAxis("left")
        y_axis.setPen(pg.mkPen(theme.plot_foreground))
        y_axis.setTextPen(pg.mkPen(theme.plot_foreground))


class PlotPanel(QWidget):
    """Main plotting panel with controls and plot area.

    Signals:
        protein_selected: Emitted when a point is clicked (protein name).
    """

    protein_selected = pyqtSignal(str)

    def __init__(self, parent=None):
        """Initialize the plot panel."""
        super().__init__(parent)
        self._metrics_store: MetricsStore | None = None
        self._filters: dict[str, tuple[float | None, float | None]] = {}
        self._init_ui()
        self._connect_signals()

    def _init_ui(self):
        """Initialize UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(5, 5, 5, 5)
        layout.setSpacing(8)

        # Plot type selection
        type_group = QGroupBox("Plot Type")
        type_layout = QHBoxLayout(type_group)
        type_layout.setContentsMargins(8, 8, 8, 8)

        self._plot_type_combo = QComboBox()
        self._plot_type_combo.addItems(["Scatter", "Box"])
        type_layout.addWidget(self._plot_type_combo)
        layout.addWidget(type_group)

        # Metric selection (stacked for different plot types)
        self._metric_controls_stack = QStackedWidget()

        # Scatter controls
        scatter_widget = QWidget()
        scatter_layout = QVBoxLayout(scatter_widget)
        scatter_layout.setContentsMargins(0, 0, 0, 0)
        scatter_layout.setSpacing(4)

        x_row = QHBoxLayout()
        x_row.addWidget(QLabel("X-Axis:"))
        self._x_metric_combo = QComboBox()
        x_row.addWidget(self._x_metric_combo, 1)
        scatter_layout.addLayout(x_row)

        y_row = QHBoxLayout()
        y_row.addWidget(QLabel("Y-Axis:"))
        self._y_metric_combo = QComboBox()
        y_row.addWidget(self._y_metric_combo, 1)
        scatter_layout.addLayout(y_row)

        self._metric_controls_stack.addWidget(scatter_widget)

        # Box controls
        box_widget = QWidget()
        box_layout = QHBoxLayout(box_widget)
        box_layout.setContentsMargins(0, 0, 0, 0)
        box_layout.addWidget(QLabel("Metric:"))
        self._box_metric_combo = QComboBox()
        box_layout.addWidget(self._box_metric_combo, 1)

        self._metric_controls_stack.addWidget(box_widget)

        metric_group = QGroupBox("Metrics")
        metric_group_layout = QVBoxLayout(metric_group)
        metric_group_layout.setContentsMargins(8, 8, 8, 8)
        metric_group_layout.addWidget(self._metric_controls_stack)
        layout.addWidget(metric_group)

        # Filter option
        self._filter_checkbox = QCheckBox("Only show filtered proteins")
        self._filter_checkbox.setToolTip(
            "When checked, only proteins passing the current metric filters will be plotted"
        )
        self._filter_checkbox.stateChanged.connect(self._update_plot)
        layout.addWidget(self._filter_checkbox)

        # Button row
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(4)

        self._update_btn = QPushButton("Update Plot")
        btn_layout.addWidget(self._update_btn)

        self._export_btn = QPushButton("Export Image")
        self._export_btn.setToolTip("Export current plot as PNG or SVG image")
        self._export_btn.clicked.connect(self._on_export_plot)
        btn_layout.addWidget(self._export_btn)

        layout.addLayout(btn_layout)

        # Plot area (stacked for scatter/box)
        self._plot_stack = QStackedWidget()

        self._scatter_plot = ScatterPlotWidget()
        self._plot_stack.addWidget(self._scatter_plot)

        self._box_plot = BoxPlotWidget()
        self._plot_stack.addWidget(self._box_plot)

        layout.addWidget(self._plot_stack, 1)

        # Status label
        self._status_label = QLabel("No data loaded")
        self._status_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self._status_label.setStyleSheet("color: gray;")
        layout.addWidget(self._status_label)

    def _connect_signals(self):
        """Connect internal signals."""
        self._plot_type_combo.currentTextChanged.connect(self._on_plot_type_changed)
        self._update_btn.clicked.connect(self._update_plot)
        self._scatter_plot.point_clicked.connect(self._on_point_clicked)

    def set_store(self, store: MetricsStore) -> None:
        """Set the metrics store.

        Args:
            store: MetricsStore instance.
        """
        self._metrics_store = store
        self._update_metric_combos()

    def _update_metric_combos(self) -> None:
        """Update metric dropdowns from store."""
        if not self._metrics_store:
            return

        metrics = self._metrics_store.metric_names

        # Save current selections
        x_current = self._x_metric_combo.currentText()
        y_current = self._y_metric_combo.currentText()
        box_current = self._box_metric_combo.currentText()

        # Update combos
        self._x_metric_combo.clear()
        self._y_metric_combo.clear()
        self._box_metric_combo.clear()

        self._x_metric_combo.addItems(metrics)
        self._y_metric_combo.addItems(metrics)
        self._box_metric_combo.addItems(metrics)

        # Restore selections if possible
        if x_current in metrics:
            self._x_metric_combo.setCurrentText(x_current)
        if y_current in metrics:
            self._y_metric_combo.setCurrentText(y_current)
        elif len(metrics) > 1:
            self._y_metric_combo.setCurrentIndex(1)
        if box_current in metrics:
            self._box_metric_combo.setCurrentText(box_current)

        # Update status
        count = self._metrics_store.count
        self._status_label.setText(f"{count} proteins available")

    def _on_plot_type_changed(self, plot_type: str) -> None:
        """Handle plot type change.

        Args:
            plot_type: Selected plot type.
        """
        if plot_type == "Scatter":
            self._metric_controls_stack.setCurrentIndex(0)
            self._plot_stack.setCurrentIndex(0)
        else:
            self._metric_controls_stack.setCurrentIndex(1)
            self._plot_stack.setCurrentIndex(1)

    def _update_plot(self) -> None:
        """Update the current plot."""
        plot_type = self._plot_type_combo.currentText()
        if plot_type == "Scatter":
            self._update_scatter_plot()
        else:
            self._update_box_plot()

    def _update_scatter_plot(self) -> None:
        """Update the scatter plot with current selections."""
        if not self._metrics_store:
            return

        x_metric = self._x_metric_combo.currentText()
        y_metric = self._y_metric_combo.currentText()

        if not x_metric or not y_metric:
            return

        # Collect data
        x_values = []
        y_values = []
        names = []
        file_paths = []

        # Check if we should filter
        show_filtered_only = self._filter_checkbox.isChecked()

        for protein in self._metrics_store:
            # Skip proteins that don't pass filters if checkbox is checked
            if show_filtered_only and not self._passes_filters(protein):
                continue

            x_val = protein.get_metric(x_metric)
            y_val = protein.get_metric(y_metric)
            if x_val is not None and y_val is not None:
                x_values.append(x_val)
                y_values.append(y_val)
                names.append(protein.name)
                file_paths.append(protein.file_path)

        self._scatter_plot.set_data(x_values, y_values, names, file_paths)
        self._scatter_plot.set_axis_labels(x_metric, y_metric)
        self._scatter_plot.set_filters(self._filters)

        if show_filtered_only:
            total = self._metrics_store.count
            self._status_label.setText(f"{len(names)} of {total} proteins plotted (filtered)")
        else:
            self._status_label.setText(f"{len(names)} proteins plotted")

    def _update_box_plot(self) -> None:
        """Update the box plot with current selection."""
        if not self._metrics_store:
            return

        metric = self._box_metric_combo.currentText()
        if not metric:
            return

        # Check if we should filter
        show_filtered_only = self._filter_checkbox.isChecked()

        # Collect values
        values = []
        total_count = 0
        for protein in self._metrics_store:
            total_count += 1
            # Skip proteins that don't pass filters if checkbox is checked
            if show_filtered_only and not self._passes_filters(protein):
                continue

            val = protein.get_metric(metric)
            if val is not None:
                values.append(val)

        self._box_plot.set_data(values, metric)
        self._box_plot.set_filters(self._filters)

        if show_filtered_only:
            self._status_label.setText(f"{len(values)} of {total_count} proteins plotted (filtered)")
        else:
            self._status_label.setText(f"{len(values)} proteins plotted")

    def _passes_filters(self, protein) -> bool:
        """Check if a protein passes all current filters.

        Args:
            protein: ProteinMetrics instance.

        Returns:
            True if protein passes all filters.
        """
        for metric_name, (min_val, max_val) in self._filters.items():
            value = protein.get_metric(metric_name)
            if value is None:
                continue  # No value, can't filter

            if min_val is not None and value < min_val:
                return False
            if max_val is not None and value > max_val:
                return False

        return True

    def _on_point_clicked(self, protein_name: str) -> None:
        """Handle click on a data point.

        Args:
            protein_name: Name of the clicked protein.
        """
        self.protein_selected.emit(protein_name)

    def refresh(self) -> None:
        """Refresh the plot with current data."""
        self._update_metric_combos()
        self._update_plot()

    def set_filters(self, filters: dict[str, tuple[float | None, float | None]]) -> None:
        """Set the current metric filters and update filter lines on plots.

        Args:
            filters: Dict of metric_name -> (min_val, max_val).
        """
        self._filters = filters.copy()
        self._scatter_plot.set_filters(self._filters)
        self._box_plot.set_filters(self._filters)

    def _on_export_plot(self) -> None:
        """Handle export plot button click."""
        # Determine which plot is active
        plot_type = self._plot_type_combo.currentText()

        if plot_type == "Scatter":
            plot_widget = self._scatter_plot._plot_widget
        else:
            plot_widget = self._box_plot._plot_widget

        # Ask for file path
        file_path, selected_filter = QFileDialog.getSaveFileName(
            self,
            "Export Plot Image",
            "",
            "PNG Files (*.png);;SVG Files (*.svg);;All Files (*)",
        )

        if not file_path:
            return

        # Ensure extension
        if not file_path.endswith(('.png', '.svg')):
            if 'SVG' in selected_filter:
                file_path += '.svg'
            else:
                file_path += '.png'

        try:
            # Use pyqtgraph's built-in exporter
            if file_path.endswith('.svg'):
                from pyqtgraph.exporters import SVGExporter
                exporter = SVGExporter(plot_widget.plotItem)
            else:
                from pyqtgraph.exporters import ImageExporter
                exporter = ImageExporter(plot_widget.plotItem)

            exporter.export(file_path)
            self._status_label.setText(f"Exported to {file_path}")
        except Exception as e:
            self._status_label.setText(f"Export failed: {e}")
