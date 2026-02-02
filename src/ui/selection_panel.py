"""Selection and coloring panel for protein viewer."""

from typing import Callable

from PyQt6.QtCore import Qt, pyqtSignal
from PyQt6.QtWidgets import (
    QWidget,
    QVBoxLayout,
    QHBoxLayout,
    QGroupBox,
    QLabel,
    QPushButton,
    QLineEdit,
    QComboBox,
    QRadioButton,
    QButtonGroup,
    QFrame,
    QScrollArea,
    QSizePolicy,
    QProgressBar,
)
from PyQt6.QtGui import QColor, QPalette

from src.config.color_schemes import (
    get_available_schemes,
    get_color_scheme,
    ColorLegendItem,
    MetricScheme,
)
from src.models.metrics import AVAILABLE_METRICS


class ColorLegendWidget(QWidget):
    """Widget displaying a color legend."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(5, 5, 5, 5)
        self._layout.setSpacing(3)
        self._items: list[QWidget] = []

    def set_legend(self, items: list[ColorLegendItem]) -> None:
        """Set the legend items.

        Args:
            items: List of ColorLegendItem with label and color.
        """
        # Clear existing items
        for item in self._items:
            self._layout.removeWidget(item)
            item.deleteLater()
        self._items.clear()

        # Add new items
        for legend_item in items:
            row = QWidget()
            row_layout = QHBoxLayout(row)
            row_layout.setContentsMargins(0, 0, 0, 0)
            row_layout.setSpacing(5)

            # Color swatch
            swatch = QFrame()
            swatch.setFixedSize(16, 16)
            swatch.setStyleSheet(
                f"background-color: {legend_item.color}; border: 1px solid #999;"
            )
            row_layout.addWidget(swatch)

            # Label
            label = QLabel(legend_item.label)
            label.setStyleSheet("font-size: 11px;")
            row_layout.addWidget(label)
            row_layout.addStretch()

            self._layout.addWidget(row)
            self._items.append(row)

    def clear(self) -> None:
        """Clear the legend."""
        for item in self._items:
            self._layout.removeWidget(item)
            item.deleteLater()
        self._items.clear()


class SelectionPanel(QWidget):
    """Panel for residue selection and coloring controls.

    Signals:
        selection_requested: Emitted with selection type and parameters.
        color_scheme_changed: Emitted when color scheme is changed.
        metric_coloring_requested: Emitted when metric coloring is requested.
    """

    selection_requested = pyqtSignal(str, object)  # (action, params)
    color_scheme_changed = pyqtSignal(str)  # scheme name
    metric_coloring_requested = pyqtSignal(str)  # metric name

    def __init__(self, parent=None):
        """Initialize the selection panel.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self._current_metric: str | None = None
        self._metric_calculating = False
        self._init_ui()

    def _init_ui(self):
        """Initialize the UI components."""
        # Main scroll area for the panel
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)

        # Container widget
        container = QWidget()
        main_layout = QVBoxLayout(container)
        main_layout.setContentsMargins(5, 5, 5, 5)
        main_layout.setSpacing(10)

        # Selection group
        selection_group = self._create_selection_group()
        main_layout.addWidget(selection_group)

        # Color scheme group
        color_group = self._create_color_scheme_group()
        main_layout.addWidget(color_group)

        # Metric coloring group
        metric_group = self._create_metric_group()
        main_layout.addWidget(metric_group)

        # Legend group
        legend_group = self._create_legend_group()
        main_layout.addWidget(legend_group)

        # Stretch at bottom
        main_layout.addStretch()

        scroll.setWidget(container)

        # Set up main layout
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.addWidget(scroll)

        # Set reasonable width
        self.setMinimumWidth(200)
        self.setMaximumWidth(300)

    def _create_selection_group(self) -> QGroupBox:
        """Create the selection controls group."""
        group = QGroupBox("Selection")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Quick selection buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(4)

        self._btn_select_all = QPushButton("All")
        self._btn_select_all.setToolTip("Select all residues")
        self._btn_select_all.clicked.connect(lambda: self.selection_requested.emit("all", None))
        btn_layout.addWidget(self._btn_select_all)

        self._btn_select_none = QPushButton("None")
        self._btn_select_none.setToolTip("Clear selection")
        self._btn_select_none.clicked.connect(lambda: self.selection_requested.emit("none", None))
        btn_layout.addWidget(self._btn_select_none)

        self._btn_select_invert = QPushButton("Invert")
        self._btn_select_invert.setToolTip("Invert selection")
        self._btn_select_invert.clicked.connect(lambda: self.selection_requested.emit("invert", None))
        btn_layout.addWidget(self._btn_select_invert)

        layout.addLayout(btn_layout)

        # Range selection
        range_layout = QHBoxLayout()
        range_layout.setSpacing(4)

        range_label = QLabel("Range:")
        range_label.setFixedWidth(45)
        range_layout.addWidget(range_label)

        self._range_input = QLineEdit()
        self._range_input.setPlaceholderText("e.g., 1-50 or A:10-30")
        self._range_input.setToolTip("Enter residue range (e.g., 1-50, A:10-A:30)")
        self._range_input.returnPressed.connect(self._on_range_select)
        range_layout.addWidget(self._range_input)

        self._btn_range_select = QPushButton("Go")
        self._btn_range_select.setFixedWidth(35)
        self._btn_range_select.clicked.connect(self._on_range_select)
        range_layout.addWidget(self._btn_range_select)

        layout.addLayout(range_layout)

        # Chain selection
        chain_layout = QHBoxLayout()
        chain_layout.setSpacing(4)

        chain_label = QLabel("Chain:")
        chain_label.setFixedWidth(45)
        chain_layout.addWidget(chain_label)

        self._chain_combo = QComboBox()
        self._chain_combo.setToolTip("Select by chain")
        self._chain_combo.addItem("(Select chain)")
        self._chain_combo.currentTextChanged.connect(self._on_chain_select)
        chain_layout.addWidget(self._chain_combo)

        layout.addLayout(chain_layout)

        # View controls
        view_layout = QHBoxLayout()
        view_layout.setSpacing(4)

        self._btn_zoom_selection = QPushButton("Zoom to Selection")
        self._btn_zoom_selection.setToolTip("Zoom view to selected residues")
        self._btn_zoom_selection.clicked.connect(lambda: self.selection_requested.emit("zoom", None))
        view_layout.addWidget(self._btn_zoom_selection)

        self._btn_center = QPushButton("Center")
        self._btn_center.setToolTip("Center view on entire structure")
        self._btn_center.clicked.connect(lambda: self.selection_requested.emit("center", None))
        view_layout.addWidget(self._btn_center)

        layout.addLayout(view_layout)

        # Selection info
        self._selection_label = QLabel("No residues selected")
        self._selection_label.setStyleSheet("color: #666; font-size: 11px;")
        layout.addWidget(self._selection_label)

        return group

    def _create_color_scheme_group(self) -> QGroupBox:
        """Create the color scheme selection group."""
        group = QGroupBox("Color Scheme")
        layout = QVBoxLayout(group)
        layout.setSpacing(4)

        self._color_scheme_group = QButtonGroup(self)
        self._color_scheme_buttons: dict[str, QRadioButton] = {}

        schemes = [
            ("spectrum", "Spectrum (N→C)"),
            ("chain", "By Chain"),
            ("secondary_structure", "Secondary Structure"),
            ("b_factor", "B-Factor"),
            ("hydrophobicity", "Hydrophobicity"),
        ]

        for scheme_id, label in schemes:
            radio = QRadioButton(label)
            radio.setToolTip(f"Color by {label.lower()}")
            self._color_scheme_group.addButton(radio)
            self._color_scheme_buttons[scheme_id] = radio
            layout.addWidget(radio)

            if scheme_id == "spectrum":
                radio.setChecked(True)

        self._color_scheme_group.buttonClicked.connect(self._on_color_scheme_changed)

        return group

    def _create_metric_group(self) -> QGroupBox:
        """Create the metric-based coloring group."""
        group = QGroupBox("Metric Coloring")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Metric selection
        metric_layout = QHBoxLayout()
        metric_layout.setSpacing(4)

        metric_label = QLabel("Metric:")
        metric_label.setFixedWidth(45)
        metric_layout.addWidget(metric_label)

        self._metric_combo = QComboBox()
        self._metric_combo.setToolTip("Select metric for coloring")
        self._metric_combo.addItem("(Select metric)")
        for metric_id, info in AVAILABLE_METRICS.items():
            self._metric_combo.addItem(info["name"], metric_id)
        metric_layout.addWidget(self._metric_combo)

        layout.addLayout(metric_layout)

        # Calculate button and progress
        calc_layout = QHBoxLayout()
        calc_layout.setSpacing(4)

        self._btn_calculate = QPushButton("Calculate && Apply")
        self._btn_calculate.setToolTip("Calculate metric and apply coloring")
        self._btn_calculate.clicked.connect(self._on_calculate_metric)
        calc_layout.addWidget(self._btn_calculate)

        layout.addLayout(calc_layout)

        # Progress bar (hidden by default)
        self._progress_bar = QProgressBar()
        self._progress_bar.setTextVisible(False)
        self._progress_bar.setMaximumHeight(10)
        self._progress_bar.hide()
        layout.addWidget(self._progress_bar)

        # Metric info
        self._metric_info_label = QLabel("")
        self._metric_info_label.setStyleSheet("color: #666; font-size: 11px;")
        self._metric_info_label.setWordWrap(True)
        layout.addWidget(self._metric_info_label)

        return group

    def _create_legend_group(self) -> QGroupBox:
        """Create the color legend group."""
        group = QGroupBox("Color Legend")
        layout = QVBoxLayout(group)
        layout.setSpacing(4)

        self._legend_widget = ColorLegendWidget()
        layout.addWidget(self._legend_widget)

        # Set initial legend for spectrum
        self._update_legend("spectrum")

        return group

    def _on_range_select(self):
        """Handle range selection."""
        text = self._range_input.text().strip()
        if not text:
            return

        # Parse range (format: start-end or chain:start-chain:end)
        try:
            params = self._parse_range(text)
            self.selection_requested.emit("range", params)
        except ValueError as e:
            self._selection_label.setText(f"Invalid range: {e}")
            self._selection_label.setStyleSheet("color: #c00; font-size: 11px;")

    def _parse_range(self, text: str) -> dict:
        """Parse a range specification.

        Args:
            text: Range string (e.g., "1-50", "A:10-A:30").

        Returns:
            Dict with 'start', 'end', and optionally 'chain'.

        Raises:
            ValueError: If format is invalid.
        """
        text = text.strip()

        # Check for chain prefix (e.g., "A:10-30" or "A:10-A:30")
        chain = None

        if ":" in text:
            # Format with chain
            parts = text.split("-")
            if len(parts) != 2:
                raise ValueError("Use format: start-end or chain:start-end")

            start_part = parts[0].strip()
            end_part = parts[1].strip()

            if ":" in start_part:
                chain, start_str = start_part.split(":", 1)
            else:
                start_str = start_part

            if ":" in end_part:
                end_chain, end_str = end_part.split(":", 1)
                if chain and end_chain != chain:
                    raise ValueError("Start and end chains must match")
                chain = chain or end_chain
            else:
                end_str = end_part

            start = int(start_str)
            end = int(end_str)
        else:
            # Simple format: start-end
            parts = text.split("-")
            if len(parts) != 2:
                raise ValueError("Use format: start-end")
            start = int(parts[0].strip())
            end = int(parts[1].strip())

        if start > end:
            start, end = end, start

        return {"start": start, "end": end, "chain": chain}

    def _on_chain_select(self, text: str):
        """Handle chain selection change."""
        if text and text != "(Select chain)":
            self.selection_requested.emit("chain", text)

    def _on_color_scheme_changed(self, button: QRadioButton):
        """Handle color scheme radio button change."""
        for scheme_id, radio in self._color_scheme_buttons.items():
            if radio == button:
                self.color_scheme_changed.emit(scheme_id)
                self._update_legend(scheme_id)
                break

    def _on_calculate_metric(self):
        """Handle calculate metric button click."""
        index = self._metric_combo.currentIndex()
        if index <= 0:
            return

        metric_id = self._metric_combo.currentData()
        if metric_id:
            self._current_metric = metric_id
            self.metric_coloring_requested.emit(metric_id)

    def _update_legend(self, scheme_name: str):
        """Update the color legend for a scheme.

        Args:
            scheme_name: Name of the color scheme.
        """
        try:
            scheme = get_color_scheme(scheme_name)
            self._legend_widget.set_legend(scheme.get_legend())
        except ValueError:
            self._legend_widget.clear()

    def set_chains(self, chains: list[str]) -> None:
        """Set available chains for selection.

        Args:
            chains: List of chain IDs.
        """
        self._chain_combo.clear()
        self._chain_combo.addItem("(Select chain)")
        for chain in sorted(chains):
            self._chain_combo.addItem(chain)

    def set_selection_count(self, count: int, total: int) -> None:
        """Update selection count display.

        Args:
            count: Number of selected residues.
            total: Total number of residues.
        """
        if count == 0:
            self._selection_label.setText("No residues selected")
            self._selection_label.setStyleSheet("color: #666; font-size: 11px;")
        else:
            self._selection_label.setText(f"{count} of {total} residues selected")
            self._selection_label.setStyleSheet("color: #333; font-size: 11px;")

    def set_metric_info(self, metric_name: str, min_val: float, max_val: float) -> None:
        """Display metric calculation results.

        Args:
            metric_name: Name of the calculated metric.
            min_val: Minimum value.
            max_val: Maximum value.
        """
        self._metric_info_label.setText(
            f"{metric_name}: {min_val:.2f} - {max_val:.2f}"
        )

        # Update legend for metric
        metric_scheme = MetricScheme(metric_name, min_val, max_val)
        self._legend_widget.set_legend(metric_scheme.get_legend())

    def set_calculating(self, calculating: bool) -> None:
        """Show/hide calculation progress.

        Args:
            calculating: Whether calculation is in progress.
        """
        self._metric_calculating = calculating
        self._btn_calculate.setEnabled(not calculating)
        self._progress_bar.setVisible(calculating)
        if calculating:
            self._progress_bar.setRange(0, 0)  # Indeterminate
        else:
            self._progress_bar.setRange(0, 100)

    def clear_state(self) -> None:
        """Clear panel state when no structure is loaded."""
        self._chain_combo.clear()
        self._chain_combo.addItem("(Select chain)")
        self._selection_label.setText("No residues selected")
        self._selection_label.setStyleSheet("color: #666; font-size: 11px;")
        self._metric_info_label.setText("")
        self._current_metric = None
        self._update_legend("spectrum")

        # Reset to spectrum coloring
        self._color_scheme_buttons["spectrum"].setChecked(True)
