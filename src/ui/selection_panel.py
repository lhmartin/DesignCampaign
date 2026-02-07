"""Selection and coloring panel for protein viewer."""


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
    QDoubleSpinBox,
    QFileDialog,
    QCheckBox,
    QColorDialog,
    QListWidget,
    QListWidgetItem,
    QSpinBox,
)
from PyQt6.QtGui import QColor

from src.config.color_schemes import (
    get_available_schemes,
    get_color_scheme,
    ColorLegendItem,
    MetricScheme,
    ChainScheme,
)
from src.models.metrics import AVAILABLE_METRICS
from src.ui.collapsible_group import CollapsibleGroupBox


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
    interface_requested = pyqtSignal(str, list, float)  # (binder_chain, target_chains, cutoff)
    select_interface_requested = pyqtSignal()  # select all interface residues
    clear_interface_requested = pyqtSignal()  # clear interface highlighting
    export_selection_requested = pyqtSignal(str, str)  # (format, file_path)
    selection_color_requested = pyqtSignal(str)  # hex color for selection
    binder_search_requested = pyqtSignal(list, float, int)  # (target_residues, cutoff, min_target_contacts)
    binder_result_selected = pyqtSignal(str)  # file_path of selected binder
    binder_group_requested = pyqtSignal(str, list)  # (group_name, file_paths)
    create_group_from_chain_requested = pyqtSignal(str, str)  # chain_id, group_name

    def __init__(self, parent=None):
        """Initialize the selection panel.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self._current_metric: str | None = None
        self._metric_calculating = False
        self._interface_residues: list[dict] = []  # [{chain, id}, ...]
        self._selected_residues: list[dict] = []  # [{chain, id}, ...]
        self._selected_color: str = "#ff0000"  # Default red for selection coloring
        self._chain_ids: list[str] = []  # Current structure's chain IDs
        self._chain_lengths: dict[str, int] = {}  # Chain ID -> residue count
        self._collapsible_groups: dict[str, CollapsibleGroupBox] = {}
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

        # Default collapsed states: True = collapsed
        default_collapsed = {
            "Selection": False,
            "Interface": False,
            "Color Scheme": False,
            "Search Binders by Contact": True,
            "Export Selection": True,
            "Metric Coloring": True,
            "Sequence Info": True,
            "Create Group from Chain": True,
        }

        # Selection group
        selection_group = self._create_selection_group()
        sel_cg = self._wrap_in_collapsible("Selection", selection_group, default_collapsed)
        main_layout.addWidget(sel_cg)

        # Interface group
        interface_group = self._create_interface_group()
        iface_cg = self._wrap_in_collapsible("Interface", interface_group, default_collapsed)
        main_layout.addWidget(iface_cg)

        # Color scheme group
        color_group = self._create_color_scheme_group()
        color_cg = self._wrap_in_collapsible("Color Scheme", color_group, default_collapsed)
        main_layout.addWidget(color_cg)

        # Binder search group
        binder_search_group = self._create_binder_search_group()
        binder_cg = self._wrap_in_collapsible("Search Binders by Contact", binder_search_group, default_collapsed)
        main_layout.addWidget(binder_cg)

        # Export group
        export_group = self._create_export_group()
        export_cg = self._wrap_in_collapsible("Export Selection", export_group, default_collapsed)
        main_layout.addWidget(export_cg)

        # Metric coloring group
        metric_group = self._create_metric_group()
        metric_cg = self._wrap_in_collapsible("Metric Coloring", metric_group, default_collapsed)
        main_layout.addWidget(metric_cg)

        # Sequence info group
        seq_info_group = self._create_sequence_info_group()
        seq_cg = self._wrap_in_collapsible("Sequence Info", seq_info_group, default_collapsed)
        main_layout.addWidget(seq_cg)

        # Chain group creation
        chain_group_box = self._create_chain_group_group()
        chain_cg = self._wrap_in_collapsible("Create Group from Chain", chain_group_box, default_collapsed)
        main_layout.addWidget(chain_cg)

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

    def _wrap_in_collapsible(
        self,
        title: str,
        group_box: QGroupBox,
        default_collapsed: dict[str, bool],
    ) -> CollapsibleGroupBox:
        """Wrap an existing QGroupBox's contents into a CollapsibleGroupBox.

        Args:
            title: Section title.
            group_box: QGroupBox whose layout contents will be moved.
            default_collapsed: Dict of default collapsed states.

        Returns:
            CollapsibleGroupBox containing the group's widgets.
        """
        collapsed = default_collapsed.get(title, False)
        cg = CollapsibleGroupBox(title, collapsed=collapsed)

        # Move the QGroupBox's layout contents into the collapsible group
        old_layout = group_box.layout()
        if old_layout:
            while old_layout.count():
                item = old_layout.takeAt(0)
                if item.widget():
                    cg.add_widget(item.widget())
                elif item.layout():
                    cg.add_layout(item.layout())

        # Discard the now-empty QGroupBox
        group_box.deleteLater()

        self._collapsible_groups[title] = cg
        return cg

    def get_collapsed_states(self) -> dict[str, bool]:
        """Get current collapsed states of all sections.

        Returns:
            Dict mapping section title to collapsed state.
        """
        return {
            title: cg.is_collapsed
            for title, cg in self._collapsible_groups.items()
        }

    def set_collapsed_states(self, states: dict[str, bool]) -> None:
        """Restore collapsed states from saved config.

        Args:
            states: Dict mapping section title to collapsed state.
        """
        for title, collapsed in states.items():
            if title in self._collapsible_groups:
                self._collapsible_groups[title].set_collapsed(collapsed)

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

        # Selection coloring
        color_layout = QHBoxLayout()
        color_layout.setSpacing(4)

        color_label = QLabel("Color:")
        color_label.setFixedWidth(45)
        color_layout.addWidget(color_label)

        self._color_btn = QPushButton()
        self._color_btn.setFixedSize(30, 25)
        self._color_btn.setStyleSheet(f"background-color: {self._selected_color};")
        self._color_btn.setToolTip("Click to choose selection color")
        self._color_btn.clicked.connect(self._on_choose_color)
        color_layout.addWidget(self._color_btn)

        self._btn_apply_color = QPushButton("Apply")
        self._btn_apply_color.setToolTip("Apply color to selected residues")
        self._btn_apply_color.clicked.connect(self._on_apply_color)
        color_layout.addWidget(self._btn_apply_color)

        layout.addLayout(color_layout)

        # Selection info
        self._selection_label = QLabel("No residues selected")
        self._selection_label.setStyleSheet("color: #666; font-size: 11px;")
        layout.addWidget(self._selection_label)

        return group

    def _create_interface_group(self) -> QGroupBox:
        """Create the interface residue controls group."""
        group = QGroupBox("Interface")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Binder chain selection
        binder_layout = QHBoxLayout()
        binder_layout.setSpacing(4)

        binder_label = QLabel("Binder:")
        binder_label.setFixedWidth(50)
        binder_layout.addWidget(binder_label)

        self._binder_chain_combo = QComboBox()
        self._binder_chain_combo.setToolTip("Select binder chain")
        self._binder_chain_combo.addItem("(Select)")
        binder_layout.addWidget(self._binder_chain_combo)

        layout.addLayout(binder_layout)

        # Target chain selection
        target_layout = QHBoxLayout()
        target_layout.setSpacing(4)

        target_label = QLabel("Target:")
        target_label.setFixedWidth(50)
        target_layout.addWidget(target_label)

        self._target_chain_combo = QComboBox()
        self._target_chain_combo.setToolTip("Select target chain(s)")
        self._target_chain_combo.addItem("(Select)")
        target_layout.addWidget(self._target_chain_combo)

        layout.addLayout(target_layout)

        # Distance cutoff
        cutoff_layout = QHBoxLayout()
        cutoff_layout.setSpacing(4)

        cutoff_label = QLabel("Cutoff:")
        cutoff_label.setFixedWidth(50)
        cutoff_layout.addWidget(cutoff_label)

        self._cutoff_spinbox = QDoubleSpinBox()
        self._cutoff_spinbox.setRange(1.0, 10.0)
        self._cutoff_spinbox.setValue(4.0)
        self._cutoff_spinbox.setSingleStep(0.5)
        self._cutoff_spinbox.setSuffix(" Å")
        self._cutoff_spinbox.setToolTip("Distance cutoff for interface contacts")
        cutoff_layout.addWidget(self._cutoff_spinbox)

        layout.addLayout(cutoff_layout)

        # Action buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(4)

        self._btn_find_interface = QPushButton("Find")
        self._btn_find_interface.setToolTip("Find interface residues")
        self._btn_find_interface.clicked.connect(self._on_find_interface)
        btn_layout.addWidget(self._btn_find_interface)

        self._btn_select_interface = QPushButton("Select")
        self._btn_select_interface.setToolTip("Select interface residues")
        self._btn_select_interface.clicked.connect(self._on_select_interface)
        self._btn_select_interface.setEnabled(False)
        btn_layout.addWidget(self._btn_select_interface)

        self._btn_clear_interface = QPushButton("Clear")
        self._btn_clear_interface.setToolTip("Clear interface highlight")
        self._btn_clear_interface.clicked.connect(self._on_clear_interface)
        self._btn_clear_interface.setEnabled(False)
        btn_layout.addWidget(self._btn_clear_interface)

        layout.addLayout(btn_layout)

        # Interface info label
        self._interface_label = QLabel("No interface calculated")
        self._interface_label.setStyleSheet("color: #666; font-size: 11px;")
        layout.addWidget(self._interface_label)

        return group

    def _create_binder_search_group(self) -> QGroupBox:
        """Create the binder search controls group."""
        group = QGroupBox("Search Binders by Contact")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Target residues input
        residue_layout = QHBoxLayout()
        residue_layout.setSpacing(4)

        residue_label = QLabel("Target:")
        residue_label.setFixedWidth(50)
        residue_layout.addWidget(residue_label)

        self._binder_search_input = QLineEdit()
        self._binder_search_input.setPlaceholderText("A:45-50, A:72")
        self._binder_search_input.setToolTip(
            "Enter target residues to search for contacting binders.\n"
            "Format: chain:residue or chain:start-end\n"
            "Examples: A:45, A:45-50, A:45,A:72"
        )
        residue_layout.addWidget(self._binder_search_input)

        layout.addLayout(residue_layout)

        # Cutoff input
        cutoff_layout = QHBoxLayout()
        cutoff_layout.setSpacing(4)

        cutoff_label = QLabel("Cutoff:")
        cutoff_label.setFixedWidth(50)
        cutoff_layout.addWidget(cutoff_label)

        self._binder_search_cutoff = QDoubleSpinBox()
        self._binder_search_cutoff.setRange(1.0, 10.0)
        self._binder_search_cutoff.setValue(4.0)
        self._binder_search_cutoff.setSingleStep(0.5)
        self._binder_search_cutoff.setSuffix(" Å")
        self._binder_search_cutoff.setToolTip("Distance cutoff for contact detection")
        cutoff_layout.addWidget(self._binder_search_cutoff)

        self._btn_search_binders = QPushButton("Search")
        self._btn_search_binders.setToolTip("Find binders contacting these residues")
        self._btn_search_binders.clicked.connect(self._on_search_binders)
        cutoff_layout.addWidget(self._btn_search_binders)

        layout.addLayout(cutoff_layout)

        # Match mode row
        match_layout = QHBoxLayout()
        match_layout.setSpacing(4)

        match_label = QLabel("Match:")
        match_label.setFixedWidth(50)
        match_layout.addWidget(match_label)

        self._match_mode_combo = QComboBox()
        self._match_mode_combo.addItem("Any residue", "any")
        self._match_mode_combo.addItem("All residues", "all")
        self._match_mode_combo.addItem("At least...", "min_count")
        self._match_mode_combo.addItem("At least %...", "min_pct")
        self._match_mode_combo.setToolTip(
            "How many target residues must be contacted:\n"
            "  Any - at least 1 target residue\n"
            "  All - every specified target residue\n"
            "  At least... - a minimum count\n"
            "  At least %... - a minimum percentage"
        )
        self._match_mode_combo.currentIndexChanged.connect(
            self._on_match_mode_changed
        )
        match_layout.addWidget(self._match_mode_combo)

        self._match_threshold_spin = QSpinBox()
        self._match_threshold_spin.setRange(1, 999)
        self._match_threshold_spin.setValue(1)
        self._match_threshold_spin.setToolTip("Minimum number of target residues to contact")
        self._match_threshold_spin.hide()
        match_layout.addWidget(self._match_threshold_spin)

        self._match_pct_spin = QSpinBox()
        self._match_pct_spin.setRange(1, 100)
        self._match_pct_spin.setValue(50)
        self._match_pct_spin.setSuffix("%")
        self._match_pct_spin.setToolTip("Minimum percentage of target residues to contact")
        self._match_pct_spin.hide()
        match_layout.addWidget(self._match_pct_spin)

        layout.addLayout(match_layout)

        # Results list
        self._binder_results_label = QLabel("No search performed")
        self._binder_results_label.setStyleSheet("color: #666; font-size: 11px;")
        layout.addWidget(self._binder_results_label)

        self._binder_results_list = QListWidget()
        self._binder_results_list.setMaximumHeight(100)
        self._binder_results_list.setToolTip("Double-click to load structure")
        self._binder_results_list.itemDoubleClicked.connect(self._on_binder_result_clicked)
        self._binder_results_list.hide()
        layout.addWidget(self._binder_results_list)

        # Create group button (shown after results)
        self._btn_create_binder_group = QPushButton("Create Group from Results")
        self._btn_create_binder_group.setToolTip(
            "Create a named group from the binder search results"
        )
        self._btn_create_binder_group.clicked.connect(self._on_create_binder_group)
        self._btn_create_binder_group.hide()
        layout.addWidget(self._btn_create_binder_group)

        # Track last search query for group naming
        self._last_binder_search_query = ""

        return group

    def _on_match_mode_changed(self, index: int) -> None:
        """Show/hide the threshold spin boxes based on match mode."""
        mode = self._match_mode_combo.currentData()
        self._match_threshold_spin.setVisible(mode == "min_count")
        self._match_pct_spin.setVisible(mode == "min_pct")

    def _compute_min_target_contacts(self, num_target_residues: int) -> int:
        """Compute the minimum target residue contacts based on match mode.

        Args:
            num_target_residues: Total number of unique target residues specified.

        Returns:
            Minimum number of target residues that must be contacted.
        """
        import math

        mode = self._match_mode_combo.currentData()
        if mode == "all":
            return num_target_residues
        elif mode == "min_count":
            return min(self._match_threshold_spin.value(), num_target_residues)
        elif mode == "min_pct":
            pct = self._match_pct_spin.value() / 100.0
            return max(1, math.ceil(pct * num_target_residues))
        else:  # "any"
            return 1

    def _on_search_binders(self) -> None:
        """Handle search binders button click."""
        text = self._binder_search_input.text().strip()
        if not text:
            self._binder_results_label.setText("Enter target residues")
            self._binder_results_label.setStyleSheet("color: #c00; font-size: 11px;")
            return

        try:
            residues = self._parse_residue_list(text)
            cutoff = self._binder_search_cutoff.value()
            # Count unique target residues for threshold computation
            unique_targets = set(residues)
            min_contacts = self._compute_min_target_contacts(len(unique_targets))
            self._last_binder_search_query = text
            self._binder_results_label.setText("Searching...")
            self._binder_results_label.setStyleSheet("color: #666; font-size: 11px;")
            self._binder_results_list.hide()
            self._btn_create_binder_group.hide()
            self._btn_search_binders.setEnabled(False)
            self.binder_search_requested.emit(residues, cutoff, min_contacts)
        except ValueError as e:
            self._binder_results_label.setText(f"Invalid format: {e}")
            self._binder_results_label.setStyleSheet("color: #c00; font-size: 11px;")

    def _parse_residue_list(self, text: str) -> list[tuple[str, int]]:
        """Parse residue specification string.

        Args:
            text: Residue specification (e.g., "A:45-50, A:72").

        Returns:
            List of (chain_id, residue_id) tuples.

        Raises:
            ValueError: If format is invalid.
        """
        residues = []
        parts = [p.strip() for p in text.split(",")]

        for part in parts:
            if not part:
                continue

            if ":" not in part:
                raise ValueError(f"Missing chain: {part}")

            chain, rest = part.split(":", 1)
            chain = chain.strip().upper()

            if "-" in rest:
                # Range: A:45-50
                start_str, end_str = rest.split("-", 1)
                start = int(start_str.strip())
                end = int(end_str.strip())
                for res_id in range(start, end + 1):
                    residues.append((chain, res_id))
            else:
                # Single: A:45
                res_id = int(rest.strip())
                residues.append((chain, res_id))

        return residues

    def set_binder_search_results(
        self,
        results: list[tuple[str, list[int], int]],
        searched_count: int = 0,
        num_target_residues: int = 0,
    ) -> None:
        """Set binder search results.

        Args:
            results: List of (file_path, [contacting_residue_ids], target_residues_contacted) tuples.
            searched_count: Number of structures that were searched.
            num_target_residues: Total number of target residues in the query.
        """
        self._btn_search_binders.setEnabled(True)
        self._binder_results_list.clear()

        scope = f" in {searched_count} structures" if searched_count else ""

        if not results:
            self._binder_results_label.setText(f"No binders found{scope}")
            self._binder_results_label.setStyleSheet("color: #666; font-size: 11px;")
            self._binder_results_list.hide()
            self._btn_create_binder_group.hide()
            return

        self._binder_results_label.setText(
            f"{len(results)} binder(s) found{scope}"
        )
        self._binder_results_label.setStyleSheet("color: #060; font-size: 11px;")

        from pathlib import Path
        for file_path, contacts, target_contacted in results:
            name = Path(file_path).stem
            target_info = (
                f"{target_contacted}/{num_target_residues} target"
                if num_target_residues
                else ""
            )
            item = QListWidgetItem(
                f"{name} ({len(contacts)} contacts, {target_info})"
            )
            item.setData(Qt.ItemDataRole.UserRole, file_path)
            item.setToolTip(
                f"File: {Path(file_path).name}\n"
                f"Binder residues contacting target: {contacts[:10]}"
                f"{'...' if len(contacts) > 10 else ''}\n"
                f"Target residues contacted: {target_contacted}/{num_target_residues}"
            )
            self._binder_results_list.addItem(item)

        self._binder_results_list.show()
        group_name = f"Contact {self._last_binder_search_query}"
        self._btn_create_binder_group.setText(
            f"Create Group \"{group_name}\" ({len(results)})"
        )
        self._btn_create_binder_group.show()

    def _on_binder_result_clicked(self, item: QListWidgetItem) -> None:
        """Handle double-click on binder search result."""
        file_path = item.data(Qt.ItemDataRole.UserRole)
        if file_path:
            self.binder_result_selected.emit(file_path)

    def _on_create_binder_group(self) -> None:
        """Create a group from the current binder search results."""
        count = self._binder_results_list.count()
        if count == 0:
            return

        # Collect file paths from the results list
        file_paths = []
        for i in range(count):
            item = self._binder_results_list.item(i)
            fp = item.data(Qt.ItemDataRole.UserRole)
            if fp:
                file_paths.append(fp)

        if not file_paths:
            return

        # Build group name from search query (e.g., "A:45-50, A:72")
        group_name = f"Contact {self._last_binder_search_query}"
        self.binder_group_requested.emit(group_name, file_paths)

    def _create_export_group(self) -> QGroupBox:
        """Create the selection export group."""
        group = QGroupBox("Export Selection")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Export format buttons
        btn_layout = QHBoxLayout()
        btn_layout.setSpacing(4)

        self._btn_export_fasta = QPushButton("FASTA")
        self._btn_export_fasta.setToolTip("Export selected residues as FASTA")
        self._btn_export_fasta.clicked.connect(lambda: self._on_export_selection("fasta"))
        btn_layout.addWidget(self._btn_export_fasta)

        self._btn_export_csv = QPushButton("CSV")
        self._btn_export_csv.setToolTip("Export selected residues as CSV")
        self._btn_export_csv.clicked.connect(lambda: self._on_export_selection("csv"))
        btn_layout.addWidget(self._btn_export_csv)

        layout.addLayout(btn_layout)

        return group

    def _create_color_scheme_group(self) -> QGroupBox:
        """Create the color scheme selection group with integrated legend."""
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

        # Legend (integrated below radio buttons)
        self._legend_widget = ColorLegendWidget()
        layout.addWidget(self._legend_widget)
        self._update_legend("spectrum")

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

    def _create_sequence_info_group(self) -> QGroupBox:
        """Create the sequence information group."""
        group = QGroupBox("Sequence Info")
        layout = QVBoxLayout(group)
        layout.setSpacing(4)

        self._sequence_length_label = QLabel("No structure loaded")
        self._sequence_length_label.setWordWrap(True)
        self._sequence_length_label.setStyleSheet("font-size: 11px;")
        layout.addWidget(self._sequence_length_label)

        return group

    def _create_chain_group_group(self) -> QGroupBox:
        """Create the chain-based group creation controls."""
        group = QGroupBox("Create Group from Chain")
        layout = QVBoxLayout(group)
        layout.setSpacing(8)

        # Chain selection
        chain_layout = QHBoxLayout()
        chain_layout.setSpacing(4)

        chain_label = QLabel("Chain:")
        chain_label.setFixedWidth(45)
        chain_layout.addWidget(chain_label)

        self._group_chain_combo = QComboBox()
        self._group_chain_combo.setToolTip(
            "Select a chain to find all structures with the same sequence"
        )
        self._group_chain_combo.addItem("(Select)")
        chain_layout.addWidget(self._group_chain_combo)

        layout.addLayout(chain_layout)

        # Group name input
        name_layout = QHBoxLayout()
        name_layout.setSpacing(4)

        name_label = QLabel("Name:")
        name_label.setFixedWidth(45)
        name_layout.addWidget(name_label)

        self._group_name_input = QLineEdit()
        self._group_name_input.setPlaceholderText("Enter group name")
        self._group_name_input.setToolTip("Name for the new group")
        name_layout.addWidget(self._group_name_input)

        layout.addLayout(name_layout)

        # Create button
        self._btn_create_chain_group = QPushButton("Find && Create Group")
        self._btn_create_chain_group.setToolTip(
            "Find all structures with matching chain sequence and create a named group"
        )
        self._btn_create_chain_group.clicked.connect(self._on_create_chain_group)
        layout.addWidget(self._btn_create_chain_group)

        # Info label
        self._chain_group_info = QLabel("")
        self._chain_group_info.setWordWrap(True)
        self._chain_group_info.setStyleSheet("color: #666; font-size: 11px;")
        layout.addWidget(self._chain_group_info)

        return group

    def _on_create_chain_group(self) -> None:
        """Handle create chain group button click."""
        chain_id = self._group_chain_combo.currentData()
        group_name = self._group_name_input.text().strip()

        if not chain_id:
            self._chain_group_info.setText("Please select a chain")
            self._chain_group_info.setStyleSheet("color: #c00; font-size: 11px;")
            return

        if not group_name:
            # Auto-generate name based on chain
            group_name = f"Chain {chain_id} Group"

        self.create_group_from_chain_requested.emit(chain_id, group_name)

    def set_chain_group_result(self, count: int, group_name: str) -> None:
        """Update the chain group info label with result.

        Args:
            count: Number of structures found.
            group_name: Name of the created group.
        """
        if count > 0:
            self._chain_group_info.setText(
                f"Created group '{group_name}' with {count} structures"
            )
            self._chain_group_info.setStyleSheet("color: #060; font-size: 11px;")
            self._group_name_input.clear()
        else:
            self._chain_group_info.setText("No matching structures found")
            self._chain_group_info.setStyleSheet("color: #c00; font-size: 11px;")

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
            if scheme_name == "chain" and self._chain_ids:
                scheme = get_color_scheme(scheme_name, chain_ids=self._chain_ids)
                self._legend_widget.set_legend(scheme.get_legend(self._chain_ids))
            else:
                scheme = get_color_scheme(scheme_name)
                self._legend_widget.set_legend(scheme.get_legend())
        except ValueError:
            self._legend_widget.clear()

    def set_chains(
        self,
        chains: list[str],
        chain_lengths: dict[str, int] | None = None,
    ) -> None:
        """Set available chains for selection.

        Args:
            chains: List of chain IDs.
            chain_lengths: Optional dict mapping chain IDs to residue counts.
        """
        self._chain_ids = sorted(chains)
        self._chain_lengths = chain_lengths or {}

        self._chain_combo.clear()
        self._chain_combo.addItem("(Select chain)")
        for chain in self._chain_ids:
            self._chain_combo.addItem(chain)

        # Also update interface chain dropdowns
        self._binder_chain_combo.clear()
        self._binder_chain_combo.addItem("(Select)")
        self._target_chain_combo.clear()
        self._target_chain_combo.addItem("(Select)")

        for chain in self._chain_ids:
            self._binder_chain_combo.addItem(chain)
            self._target_chain_combo.addItem(chain)

        # Auto-select if only two chains
        if len(chains) == 2:
            self._binder_chain_combo.setCurrentText(chains[1] if len(chains) > 1 else chains[0])
            self._target_chain_combo.setCurrentText(chains[0])

        # Update group chain combo
        self._group_chain_combo.clear()
        self._group_chain_combo.addItem("(Select)")
        for chain in self._chain_ids:
            length_str = f" ({self._chain_lengths.get(chain, '?')} res)" if chain in self._chain_lengths else ""
            self._group_chain_combo.addItem(f"{chain}{length_str}", chain)

        # Update sequence length display
        self._update_sequence_length_label()

        # Refresh legend if chain scheme is currently active
        for scheme_id, radio in self._color_scheme_buttons.items():
            if radio.isChecked():
                self._update_legend(scheme_id)
                break

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

        # Clear interface state
        self._binder_chain_combo.clear()
        self._binder_chain_combo.addItem("(Select)")
        self._target_chain_combo.clear()
        self._target_chain_combo.addItem("(Select)")
        self._interface_residues = []
        self._selected_residues = []
        self._interface_label.setText("No interface calculated")
        self._btn_select_interface.setEnabled(False)
        self._btn_clear_interface.setEnabled(False)

        # Clear chain group creation state
        self._group_chain_combo.clear()
        self._group_chain_combo.addItem("(Select)")
        self._group_name_input.clear()
        self._chain_group_info.setText("")

        # Clear chain info
        self._chain_ids = []
        self._chain_lengths = {}
        self._sequence_length_label.setText("No structure loaded")

    # Interface handler methods

    def _on_find_interface(self) -> None:
        """Handle find interface button click."""
        binder = self._binder_chain_combo.currentText()
        target = self._target_chain_combo.currentText()

        if binder == "(Select)" or target == "(Select)":
            self._interface_label.setText("Select binder and target chains")
            self._interface_label.setStyleSheet("color: #c00; font-size: 11px;")
            return

        if binder == target:
            self._interface_label.setText("Binder and target must be different")
            self._interface_label.setStyleSheet("color: #c00; font-size: 11px;")
            return

        cutoff = self._cutoff_spinbox.value()
        self.interface_requested.emit(binder, [target], cutoff)

    def _on_select_interface(self) -> None:
        """Handle select interface button click."""
        self.select_interface_requested.emit()

    def _on_clear_interface(self) -> None:
        """Handle clear interface button click."""
        self._interface_residues = []
        self._interface_label.setText("No interface calculated")
        self._interface_label.setStyleSheet("color: #666; font-size: 11px;")
        self._btn_select_interface.setEnabled(False)
        self._btn_clear_interface.setEnabled(False)
        # Emit signal to clear interface highlighting in viewer
        self.clear_interface_requested.emit()

    def set_default_cutoff(self, cutoff: float) -> None:
        """Set the default interface cutoff value.

        Args:
            cutoff: Distance cutoff in Angstroms.
        """
        self._cutoff_spinbox.setValue(cutoff)
        self._binder_search_cutoff.setValue(cutoff)

    def set_interface_result(
        self,
        interface_residues: list[dict],
        target_count: int = 0,
    ) -> None:
        """Update interface display after calculation.

        Args:
            interface_residues: List of binder-side interface residues [{chain, id}, ...].
            target_count: Number of target-side interface residues.
        """
        self._interface_residues = [r.copy() for r in interface_residues]

        if interface_residues:
            # Summarize by chain
            chains: dict[str, int] = {}
            for r in interface_residues:
                chains[r["chain"]] = chains.get(r["chain"], 0) + 1
            chain_parts = [f"{count} ({chain})" for chain, count in chains.items()]
            parts = [f"{len(interface_residues)} binder: {', '.join(chain_parts)}"]
            if target_count > 0:
                parts.append(f"{target_count} target")
            self._interface_label.setText("Interface: " + ", ".join(parts))
            self._interface_label.setStyleSheet("color: #333; font-size: 11px;")
            self._btn_select_interface.setEnabled(True)
            self._btn_clear_interface.setEnabled(True)
        else:
            self._interface_label.setText("No interface residues found")
            self._interface_label.setStyleSheet("color: #666; font-size: 11px;")
            self._btn_select_interface.setEnabled(False)
            self._btn_clear_interface.setEnabled(False)

    def get_interface_residues(self) -> list[dict]:
        """Get the current interface residues as [{chain, id}, ...]."""
        return [r.copy() for r in self._interface_residues]

    # Selection color handler methods

    def _on_choose_color(self) -> None:
        """Handle color button click to open color picker."""
        color = QColorDialog.getColor(QColor(self._selected_color), self, "Select Color")
        if color.isValid():
            self._selected_color = color.name()
            self._color_btn.setStyleSheet(f"background-color: {self._selected_color};")

    def _on_apply_color(self) -> None:
        """Handle apply color button click."""
        self.selection_color_requested.emit(self._selected_color)

    # Export handler methods

    def _on_export_selection(self, format_type: str) -> None:
        """Handle export selection button click.

        Args:
            format_type: Export format ('fasta' or 'csv').
        """
        if format_type == "fasta":
            file_filter = "FASTA Files (*.fasta *.fa);;All Files (*)"
            default_ext = ".fasta"
        else:
            file_filter = "CSV Files (*.csv);;All Files (*)"
            default_ext = ".csv"

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            f"Export Selection as {format_type.upper()}",
            "",
            file_filter,
        )

        if file_path:
            # Ensure extension
            if not file_path.endswith(default_ext):
                file_path += default_ext
            self.export_selection_requested.emit(format_type, file_path)

    def set_selected_residues(self, residues: list[dict]) -> None:
        """Store the currently selected residues.

        Args:
            residues: List of selected residues [{chain, id}, ...].
        """
        self._selected_residues = [r.copy() for r in residues]

    def _update_sequence_length_label(self) -> None:
        """Update the sequence length display based on current chains."""
        if not self._chain_ids:
            self._sequence_length_label.setText("No structure loaded")
            return

        if not self._chain_lengths:
            # Just show chain list without lengths
            self._sequence_length_label.setText(f"Chains: {', '.join(self._chain_ids)}")
            return

        # Build display string: "Chain A: 150 | Chain B: 120 | Total: 270"
        parts = []
        total = 0
        for chain_id in self._chain_ids:
            length = self._chain_lengths.get(chain_id, 0)
            parts.append(f"{chain_id}: {length}")
            total += length

        display = " | ".join(parts)
        if len(self._chain_ids) > 1:
            display += f" | Total: {total}"
        else:
            display = f"Chain {display}"

        self._sequence_length_label.setText(display)

    def get_chain_ids(self) -> list[str]:
        """Get the current structure's chain IDs."""
        return self._chain_ids.copy()
