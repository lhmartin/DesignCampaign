"""Main application window for DesignCampaign."""

from pathlib import Path
from typing import Any

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QAction, QKeySequence
from PyQt6.QtWidgets import (
    QMainWindow,
    QSplitter,
    QWidget,
    QVBoxLayout,
    QStatusBar,
    QMenuBar,
    QFileDialog,
)

from src.config.settings import (
    APP_NAME,
    APP_VERSION,
    DEFAULT_WINDOW_WIDTH,
    DEFAULT_WINDOW_HEIGHT,
    LEFT_PANEL_RATIO,
)
from src.ui.file_list import FileListWidget
from src.ui.viewer import ProteinViewer
from src.ui.selection_panel import SelectionPanel
from src.models.protein import Protein
from src.models.metrics import MetricResult


class MetricCalculationWorker(QThread):
    """Worker thread for calculating metrics without blocking UI."""

    finished = pyqtSignal(object)  # MetricResult
    error = pyqtSignal(str)

    def __init__(self, protein: Protein, metric_name: str):
        super().__init__()
        self._protein = protein
        self._metric_name = metric_name

    def run(self):
        try:
            result = self._protein.calculate_metric(self._metric_name)
            self.finished.emit(result)
        except Exception as e:
            self.error.emit(str(e))


class MainWindow(QMainWindow):
    """Main application window with file list, protein viewer, and selection panel."""

    def __init__(self):
        """Initialize the main window."""
        super().__init__()
        self._current_protein: Protein | None = None
        self._metric_worker: MetricCalculationWorker | None = None
        self._init_ui()
        self._init_menu()
        self._init_statusbar()
        self._connect_signals()

    def _init_ui(self):
        """Initialize the UI components."""
        self.setWindowTitle(f"{APP_NAME} v{APP_VERSION}")
        self.resize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)

        # Central widget with splitter layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)

        # Horizontal splitter for left (file list), center (viewer), right (panel)
        self._splitter = QSplitter(Qt.Orientation.Horizontal)

        # Left panel: File list
        self._file_list = FileListWidget()
        self._splitter.addWidget(self._file_list)

        # Center: Protein viewer
        self._viewer = ProteinViewer()
        self._splitter.addWidget(self._viewer)

        # Right panel: Selection and coloring controls
        self._selection_panel = SelectionPanel()
        self._splitter.addWidget(self._selection_panel)

        # Set initial splitter sizes (20% left, 60% center, 20% right)
        total_width = DEFAULT_WINDOW_WIDTH
        left_width = int(total_width * 0.20)
        right_width = int(total_width * 0.20)
        center_width = total_width - left_width - right_width
        self._splitter.setSizes([left_width, center_width, right_width])

        layout.addWidget(self._splitter)

    def _init_menu(self):
        """Initialize the menu bar."""
        menubar = self.menuBar()

        # File menu
        file_menu = menubar.addMenu("&File")

        open_action = QAction("&Open Folder...", self)
        open_action.setShortcut(QKeySequence("Ctrl+O"))
        open_action.setStatusTip("Open a folder containing protein files")
        open_action.triggered.connect(self._on_open_folder)
        file_menu.addAction(open_action)

        refresh_action = QAction("&Refresh", self)
        refresh_action.setShortcut(QKeySequence("Ctrl+R"))
        refresh_action.setStatusTip("Refresh the file list")
        refresh_action.triggered.connect(self._on_refresh)
        file_menu.addAction(refresh_action)

        file_menu.addSeparator()

        quit_action = QAction("&Quit", self)
        quit_action.setShortcut(QKeySequence("Ctrl+Q"))
        quit_action.setStatusTip("Exit the application")
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

        # View menu
        view_menu = menubar.addMenu("&View")

        clear_action = QAction("&Clear Viewer", self)
        clear_action.setStatusTip("Clear the current structure from the viewer")
        clear_action.triggered.connect(self._on_clear_viewer)
        view_menu.addAction(clear_action)

        view_menu.addSeparator()

        # Style submenu
        style_menu = view_menu.addMenu("&Style")
        for style in ["cartoon", "stick", "sphere", "line", "surface"]:
            action = QAction(style.capitalize(), self)
            action.triggered.connect(lambda checked, s=style: self._viewer.set_style(s))
            style_menu.addAction(action)

        view_menu.addSeparator()

        # Color scheme submenu
        color_menu = view_menu.addMenu("&Color Scheme")
        color_schemes = [
            ("spectrum", "Spectrum (N→C)"),
            ("chain", "By Chain"),
            ("secondary_structure", "Secondary Structure"),
            ("b_factor", "B-Factor"),
            ("hydrophobicity", "Hydrophobicity"),
        ]
        for scheme_id, label in color_schemes:
            action = QAction(label, self)
            action.triggered.connect(
                lambda checked, s=scheme_id: self._on_color_scheme_menu(s)
            )
            color_menu.addAction(action)

        view_menu.addSeparator()

        # Selection actions
        select_all_action = QAction("Select &All Residues", self)
        select_all_action.setShortcut(QKeySequence("Ctrl+A"))
        select_all_action.triggered.connect(self._viewer.select_all)
        view_menu.addAction(select_all_action)

        clear_selection_action = QAction("Clear &Selection", self)
        clear_selection_action.setShortcut(QKeySequence("Escape"))
        clear_selection_action.triggered.connect(self._viewer.clear_selection)
        view_menu.addAction(clear_selection_action)

        zoom_selection_action = QAction("&Zoom to Selection", self)
        zoom_selection_action.setShortcut(QKeySequence("Z"))
        zoom_selection_action.triggered.connect(self._viewer.zoom_to_selection)
        view_menu.addAction(zoom_selection_action)

        center_action = QAction("Center &View", self)
        center_action.setShortcut(QKeySequence("C"))
        center_action.triggered.connect(self._viewer.center_view)
        view_menu.addAction(center_action)

    def _init_statusbar(self):
        """Initialize the status bar."""
        self._statusbar = QStatusBar()
        self.setStatusBar(self._statusbar)
        self._statusbar.showMessage("Ready")

    def _connect_signals(self):
        """Connect signals between components."""
        # Connect file selection to viewer
        self._file_list.file_selected.connect(self._on_file_selected)

        # Connect folder change to status bar
        self._file_list.folder_changed.connect(self._on_folder_changed)

        # Connect viewer events to status bar
        self._viewer.structure_loaded.connect(self._on_structure_loaded)
        self._viewer.error_occurred.connect(self._on_error)
        self._viewer.selection_changed.connect(self._on_selection_changed)

        # Connect selection panel signals
        self._selection_panel.selection_requested.connect(self._on_selection_requested)
        self._selection_panel.color_scheme_changed.connect(self._on_color_scheme_changed)
        self._selection_panel.metric_coloring_requested.connect(self._on_metric_coloring_requested)
        self._selection_panel.interface_requested.connect(self._on_interface_requested)
        self._selection_panel.select_interface_requested.connect(self._on_select_interface)
        self._selection_panel.export_selection_requested.connect(self._on_export_selection)

    def _on_open_folder(self):
        """Handle File > Open Folder action."""
        folder = QFileDialog.getExistingDirectory(
            self,
            "Select Folder with Protein Files",
            "",
            QFileDialog.Option.ShowDirsOnly,
        )
        if folder:
            self._file_list.load_folder(folder)

    def _on_refresh(self):
        """Handle File > Refresh action."""
        if self._file_list.current_folder:
            self._file_list.load_folder(self._file_list.current_folder)

    def _on_clear_viewer(self):
        """Handle clear viewer action."""
        self._viewer.clear()
        self._current_protein = None
        self._selection_panel.clear_state()

    def _on_file_selected(self, file_path: str):
        """Handle file selection from the file list.

        Args:
            file_path: Path to the selected file.
        """
        self._statusbar.showMessage(f"Loading: {file_path}")
        self._viewer.load_structure(file_path)

        # Load protein model for metrics
        try:
            self._current_protein = Protein(file_path)
            # Pre-load structure for faster metric calculation
            _ = self._current_protein.structure
        except Exception as e:
            self._statusbar.showMessage(f"Warning: Could not load structure model: {e}")
            self._current_protein = None

    def _on_folder_changed(self, folder_path: str):
        """Handle folder change.

        Args:
            folder_path: Path to the new folder.
        """
        count = self._file_list.file_count
        self._statusbar.showMessage(f"Loaded {count} file(s) from {folder_path}")

    def _on_structure_loaded(self, file_path: str):
        """Handle successful structure load.

        Args:
            file_path: Path to the loaded structure.
        """
        self._statusbar.showMessage(f"Loaded: {file_path}")

        # Update selection panel with structure info
        if self._current_protein:
            chains = self._current_protein.get_chains()
            self._selection_panel.set_chains(chains)

            num_residues = self._current_protein.get_num_residues()
            self._selection_panel.set_selection_count(0, num_residues)

            # Load sequence into viewer
            sequence = self._current_protein.get_sequence()
            self._viewer.set_sequence(sequence)

    def _on_error(self, message: str):
        """Handle error from viewer.

        Args:
            message: Error message.
        """
        self._statusbar.showMessage(f"Error: {message}")

    def _on_selection_changed(self, residue_ids: list[int]):
        """Handle selection change in viewer.

        Args:
            residue_ids: List of selected residue IDs.
        """
        if self._current_protein:
            total = self._current_protein.get_num_residues()
            self._selection_panel.set_selection_count(len(residue_ids), total)
            self._selection_panel.set_selected_residues(residue_ids)

        # Sync to sequence viewer
        self._viewer.sync_selection_to_sequence()

    def _on_selection_requested(self, action: str, params: Any):
        """Handle selection request from panel.

        Args:
            action: Selection action type.
            params: Action parameters.
        """
        if action == "all":
            self._viewer.select_all()
        elif action == "none":
            self._viewer.clear_selection()
        elif action == "invert":
            self._viewer.invert_selection()
        elif action == "zoom":
            self._viewer.zoom_to_selection()
        elif action == "center":
            self._viewer.center_view()
        elif action == "range":
            if params:
                self._viewer.select_range(
                    params["start"],
                    params["end"],
                    params.get("chain")
                )
        elif action == "chain":
            if params:
                self._viewer.select_chain(params)

    def _on_color_scheme_changed(self, scheme_name: str):
        """Handle color scheme change from panel.

        Args:
            scheme_name: Name of the color scheme.
        """
        self._viewer.set_color_scheme(scheme_name)
        self._statusbar.showMessage(f"Color scheme: {scheme_name}")

    def _on_color_scheme_menu(self, scheme_name: str):
        """Handle color scheme change from menu.

        Args:
            scheme_name: Name of the color scheme.
        """
        self._viewer.set_color_scheme(scheme_name)
        self._statusbar.showMessage(f"Color scheme: {scheme_name}")

    def _on_metric_coloring_requested(self, metric_name: str):
        """Handle metric coloring request.

        Args:
            metric_name: Name of the metric to calculate and display.
        """
        if not self._current_protein:
            self._statusbar.showMessage("No structure loaded")
            return

        self._statusbar.showMessage(f"Calculating {metric_name}...")
        self._selection_panel.set_calculating(True)

        # Run calculation in background thread
        self._metric_worker = MetricCalculationWorker(
            self._current_protein, metric_name
        )
        self._metric_worker.finished.connect(self._on_metric_calculated)
        self._metric_worker.error.connect(self._on_metric_error)
        self._metric_worker.start()

    def _on_metric_calculated(self, result: MetricResult):
        """Handle successful metric calculation.

        Args:
            result: Calculated metric result.
        """
        self._selection_panel.set_calculating(False)

        # Apply coloring to viewer
        self._viewer.set_metric_coloring(
            result.values,
            result.min_value,
            result.max_value
        )

        # Update panel with metric info
        self._selection_panel.set_metric_info(
            result.name,
            result.min_value,
            result.max_value
        )

        self._statusbar.showMessage(
            f"{result.name} calculated: {result.min_value:.2f} - {result.max_value:.2f}"
        )

    def _on_metric_error(self, message: str):
        """Handle metric calculation error.

        Args:
            message: Error message.
        """
        self._selection_panel.set_calculating(False)
        self._statusbar.showMessage(f"Metric calculation failed: {message}")

    @property
    def file_list(self) -> FileListWidget:
        """Get the file list widget."""
        return self._file_list

    @property
    def viewer(self) -> ProteinViewer:
        """Get the protein viewer widget."""
        return self._viewer

    @property
    def selection_panel(self) -> SelectionPanel:
        """Get the selection panel widget."""
        return self._selection_panel

    # Interface handlers

    def _on_interface_requested(self, binder_chain: str, target_chains: list[str], cutoff: float):
        """Handle interface calculation request.

        Args:
            binder_chain: Chain ID for the binder.
            target_chains: List of chain IDs for the target.
            cutoff: Distance cutoff in Angstroms.
        """
        if not self._current_protein:
            self._statusbar.showMessage("No structure loaded")
            return

        self._statusbar.showMessage(f"Calculating interface ({binder_chain} vs {target_chains})...")

        try:
            interface = self._current_protein.get_interface_residues(
                binder_chain=binder_chain,
                target_chains=target_chains,
                distance_cutoff=cutoff,
            )

            residue_ids = list(interface.keys())
            self._selection_panel.set_interface_result(residue_ids)
            self._viewer.set_interface_residues(residue_ids)

            if residue_ids:
                self._statusbar.showMessage(f"Found {len(residue_ids)} interface residues")
            else:
                self._statusbar.showMessage("No interface residues found at this cutoff")

        except Exception as e:
            self._statusbar.showMessage(f"Interface calculation failed: {e}")
            self._selection_panel.set_interface_result([])

    def _on_select_interface(self):
        """Handle select interface residues request."""
        interface_ids = self._selection_panel.get_interface_residues()
        if interface_ids:
            self._viewer.select_residues(interface_ids)
            self._statusbar.showMessage(f"Selected {len(interface_ids)} interface residues")

    # Export handlers

    def _on_export_selection(self, format_type: str, file_path: str):
        """Handle selection export request.

        Args:
            format_type: Export format ('fasta' or 'csv').
            file_path: Output file path.
        """
        if not self._current_protein:
            self._statusbar.showMessage("No structure loaded")
            return

        selected = self._viewer.selected_residues
        if not selected:
            self._statusbar.showMessage("No residues selected")
            return

        try:
            sequence = self._current_protein.get_sequence()

            # Filter to selected residues
            selected_set = set(selected)
            selected_residues = [r for r in sequence if r["id"] in selected_set]

            if format_type == "fasta":
                self._export_fasta(file_path, selected_residues)
            else:
                self._export_csv(file_path, selected_residues)

            self._statusbar.showMessage(f"Exported {len(selected_residues)} residues to {file_path}")

        except Exception as e:
            self._statusbar.showMessage(f"Export failed: {e}")

    def _export_fasta(self, file_path: str, residues: list[dict]) -> None:
        """Export residues as FASTA format.

        Args:
            file_path: Output file path.
            residues: List of residue dicts.
        """
        sequence = "".join(r["one_letter"] for r in residues)
        name = self._current_protein.name if self._current_protein else "selection"

        # Create FASTA header with residue range info
        if residues:
            first_id = residues[0]["id"]
            last_id = residues[-1]["id"]
            header = f">{name}_residues_{first_id}-{last_id}"
        else:
            header = f">{name}_selection"

        with open(file_path, "w") as f:
            f.write(f"{header}\n")
            # Write sequence in lines of 60 characters
            for i in range(0, len(sequence), 60):
                f.write(f"{sequence[i:i+60]}\n")

    def _export_csv(self, file_path: str, residues: list[dict]) -> None:
        """Export residues as CSV format.

        Args:
            file_path: Output file path.
            residues: List of residue dicts.
        """
        with open(file_path, "w") as f:
            f.write("residue_id,chain,residue_name,one_letter\n")
            for r in residues:
                f.write(f"{r['id']},{r['chain']},{r['name']},{r['one_letter']}\n")
