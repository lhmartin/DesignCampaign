"""Main application window for DesignCampaign."""

import logging
from pathlib import Path
from typing import Any

from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QAction, QKeySequence
from PyQt6.QtWidgets import (
    QApplication,
    QMainWindow,
    QSplitter,
    QWidget,
    QVBoxLayout,
    QStatusBar,
    QMenuBar,
    QFileDialog,
    QTabWidget,
    QMessageBox,
    QSizePolicy,
)

from src.config.settings import (
    APP_NAME,
    APP_VERSION,
    DEFAULT_WINDOW_WIDTH,
    DEFAULT_WINDOW_HEIGHT,
    LEFT_PANEL_RATIO,
)
from src.config.theme_manager import get_theme_manager
from src.config.user_config import load_config, save_config, UserConfig
from src.utils.file_utils import get_json_files
from src.ui.file_list import FileListWidget
from src.ui.viewer import ProteinViewer
from src.ui.selection_panel import SelectionPanel
from src.ui.metrics_table import MetricsTableWidget
from src.ui.plot_panel import PlotPanel
from src.ui.dialogs.target_dialog import TargetDesignationDialog
from src.models.protein import Protein
from src.models.metrics import MetricResult
from src.models.metrics_store import MetricsStore, ProteinMetrics
from src.models.grouping import GroupingManager

logger = logging.getLogger(__name__)


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


class BatchMetricWorker(QThread):
    """Worker thread for calculating metrics for multiple proteins."""

    progress = pyqtSignal(int, int)  # current, total
    protein_done = pyqtSignal(str, object)  # name, MetricResult
    finished = pyqtSignal()
    error = pyqtSignal(str, str)  # protein name, error message

    def __init__(self, file_paths: list[str], metric_name: str):
        super().__init__()
        self._file_paths = file_paths
        self._metric_name = metric_name

    def run(self):
        total = len(self._file_paths)
        for i, file_path in enumerate(self._file_paths):
            self.progress.emit(i + 1, total)
            try:
                protein = Protein(file_path)
                result = protein.calculate_metric(self._metric_name)
                self.protein_done.emit(protein.name, result)
            except Exception as e:
                name = Path(file_path).stem
                self.error.emit(name, str(e))
        self.finished.emit()


class SequenceGroupWorker(QThread):
    """Worker thread for computing sequence groups without blocking UI."""

    progress = pyqtSignal(int, int, str)  # current, total, current_file
    protein_loaded = pyqtSignal(str, object)  # file_path, Protein
    finished = pyqtSignal(list)  # list of (file_path, Protein) tuples
    error = pyqtSignal(str, str)  # file_path, error message

    def __init__(self, file_paths: list[str], grouping_manager: "GroupingManager"):
        super().__init__()
        self._file_paths = file_paths
        self._grouping_manager = grouping_manager
        self._cancelled = False

    def cancel(self):
        """Cancel the operation."""
        self._cancelled = True

    def run(self):
        total = len(self._file_paths)
        proteins = []

        for i, file_path in enumerate(self._file_paths):
            if self._cancelled:
                break

            name = Path(file_path).name
            self.progress.emit(i + 1, total, name)

            # Check if we have cached hash - if so, we still need to load
            # but can skip if hash is already available and valid
            cached_result = self._grouping_manager.get_or_compute_sequence_hash(file_path)
            if cached_result is not None:
                # Hash is cached, but we still need the protein for grouping
                # Only load if not already registered
                if file_path not in self._grouping_manager._proteins:
                    try:
                        protein = Protein(file_path)
                        proteins.append((file_path, protein))
                        self.protein_loaded.emit(file_path, protein)
                    except Exception as e:
                        self.error.emit(file_path, str(e))
                else:
                    # Already have the protein
                    protein = self._grouping_manager._proteins[file_path]
                    proteins.append((file_path, protein))
            else:
                # No cache, need to load and compute
                try:
                    protein = Protein(file_path)
                    proteins.append((file_path, protein))
                    self.protein_loaded.emit(file_path, protein)
                except Exception as e:
                    self.error.emit(file_path, str(e))

        self.finished.emit(proteins)


class MainWindow(QMainWindow):
    """Main application window with file list, metrics table, protein viewer, and selection panel."""

    def __init__(self):
        """Initialize the main window."""
        super().__init__()
        self._current_protein: Protein | None = None
        self._current_folder: str | None = None
        self._metric_worker: MetricCalculationWorker | None = None
        self._batch_worker: BatchMetricWorker | None = None
        self._sequence_group_worker: SequenceGroupWorker | None = None
        self._metrics_store = MetricsStore()
        self._grouping_manager = GroupingManager()
        self._user_config = load_config()
        self._init_ui()
        self._init_menu()
        self._init_statusbar()
        self._connect_signals()
        self._restore_settings()

    def _init_ui(self):
        """Initialize the UI components."""
        self.setWindowTitle(f"{APP_NAME} v{APP_VERSION}")
        self.resize(DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)

        # Central widget with splitter layout
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        layout = QVBoxLayout(central_widget)
        layout.setContentsMargins(0, 0, 0, 0)

        # Horizontal splitter for left (tabs), center (viewer), right (panel)
        self._splitter = QSplitter(Qt.Orientation.Horizontal)
        self._splitter.setHandleWidth(8)
        self._splitter.setOpaqueResize(False)
        self._splitter.setChildrenCollapsible(False)

        # Left panel: Tabbed file list and metrics table
        self._left_tabs = QTabWidget()
        # Prevent tab content size hints from affecting the window size,
        # which can cause a fatal 1px buffer mismatch on Wayland when maximized.
        self._left_tabs.setSizePolicy(
            QSizePolicy.Policy.Preferred, QSizePolicy.Policy.Ignored
        )

        # File list tab
        self._file_list = FileListWidget()
        self._file_list.set_grouping_manager(self._grouping_manager)
        self._left_tabs.addTab(self._file_list, "Files")

        # Metrics table tab
        self._metrics_table = MetricsTableWidget()
        self._left_tabs.addTab(self._metrics_table, "Metrics")

        # Plot panel tab
        self._plot_panel = PlotPanel()
        self._left_tabs.addTab(self._plot_panel, "Plots")

        self._splitter.addWidget(self._left_tabs)

        # Center: Protein viewer
        self._viewer = ProteinViewer()
        self._splitter.addWidget(self._viewer)

        # Right panel: Selection and coloring controls
        self._selection_panel = SelectionPanel()
        self._splitter.addWidget(self._selection_panel)

        # Set initial splitter sizes (25% left, 55% center, 20% right)
        total_width = DEFAULT_WINDOW_WIDTH
        left_width = int(total_width * 0.25)
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

        # Import submenu
        import_menu = file_menu.addMenu("&Import Metrics")

        import_csv_action = QAction("From &CSV...", self)
        import_csv_action.setStatusTip("Import metrics from a CSV file")
        import_csv_action.triggered.connect(self._on_import_csv)
        import_menu.addAction(import_csv_action)

        import_json_action = QAction("From &JSON...", self)
        import_json_action.setStatusTip("Import metrics from a JSON file")
        import_json_action.triggered.connect(self._on_import_json)
        import_menu.addAction(import_json_action)

        # Export submenu
        export_menu = file_menu.addMenu("&Export Metrics")

        export_csv_action = QAction("To &CSV...", self)
        export_csv_action.setStatusTip("Export metrics to a CSV file")
        export_csv_action.triggered.connect(self._on_export_csv)
        export_menu.addAction(export_csv_action)

        export_json_action = QAction("To &JSON...", self)
        export_json_action.setStatusTip("Export metrics to a JSON file")
        export_json_action.triggered.connect(self._on_export_json)
        export_menu.addAction(export_json_action)

        export_menu.addSeparator()

        export_filtered_fasta_action = QAction("Filtered Sequences to &FASTA...", self)
        export_filtered_fasta_action.setStatusTip("Export sequences of filtered proteins to FASTA")
        export_filtered_fasta_action.triggered.connect(self._on_export_filtered_fasta)
        export_menu.addAction(export_filtered_fasta_action)

        export_filtered_csv_action = QAction("Filtered &Proteins to CSV...", self)
        export_filtered_csv_action.setStatusTip("Export filtered protein names and metrics to CSV")
        export_filtered_csv_action.triggered.connect(self._on_export_filtered_csv)
        export_menu.addAction(export_filtered_csv_action)

        file_menu.addSeparator()

        quit_action = QAction("&Quit", self)
        quit_action.setShortcut(QKeySequence("Ctrl+Q"))
        quit_action.setStatusTip("Exit the application")
        quit_action.triggered.connect(self.close)
        file_menu.addAction(quit_action)

        # Metrics menu
        metrics_menu = menubar.addMenu("&Metrics")

        calc_rasa_action = QAction("Calculate &RASA for All...", self)
        calc_rasa_action.setStatusTip("Calculate RASA for all proteins in folder")
        calc_rasa_action.triggered.connect(lambda: self._on_batch_calculate("rasa"))
        metrics_menu.addAction(calc_rasa_action)

        calc_plddt_action = QAction("Extract &pLDDT for All...", self)
        calc_plddt_action.setStatusTip("Extract pLDDT for all proteins in folder")
        calc_plddt_action.triggered.connect(lambda: self._on_batch_calculate("plddt"))
        metrics_menu.addAction(calc_plddt_action)

        calc_bfactor_action = QAction("Extract &B-factor for All...", self)
        calc_bfactor_action.setStatusTip("Extract B-factor for all proteins in folder")
        calc_bfactor_action.triggered.connect(lambda: self._on_batch_calculate("bfactor"))
        metrics_menu.addAction(calc_bfactor_action)

        metrics_menu.addSeparator()

        clear_metrics_action = QAction("&Clear All Metrics", self)
        clear_metrics_action.setStatusTip("Clear all metrics data")
        clear_metrics_action.triggered.connect(self._on_clear_metrics)
        metrics_menu.addAction(clear_metrics_action)

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

        view_menu.addSeparator()

        # Target designation action
        designate_action = QAction("&Designate Target Chains...", self)
        designate_action.setShortcut(QKeySequence("Ctrl+T"))
        designate_action.setStatusTip("Designate which chains are target vs binder")
        designate_action.triggered.connect(self._on_designate_target)
        view_menu.addAction(designate_action)

        auto_target_action = QAction("&Auto-Detect Targets", self)
        auto_target_action.setStatusTip(
            "Auto-detect target chains by finding shared sequences across structures"
        )
        auto_target_action.triggered.connect(self._on_auto_detect_targets)
        view_menu.addAction(auto_target_action)

        view_menu.addSeparator()

        # Dark mode toggle
        self._dark_mode_action = QAction("&Dark Mode", self)
        self._dark_mode_action.setCheckable(True)
        self._dark_mode_action.setChecked(get_theme_manager().is_dark_mode)
        self._dark_mode_action.setShortcut(QKeySequence("Ctrl+D"))
        self._dark_mode_action.setStatusTip("Toggle dark mode")
        self._dark_mode_action.triggered.connect(self._on_toggle_dark_mode)
        view_menu.addAction(self._dark_mode_action)

        # Connect theme manager to update viewer background
        get_theme_manager().add_listener(self._on_theme_changed)

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
        self._selection_panel.clear_interface_requested.connect(self._on_clear_interface_requested)
        self._selection_panel.selection_color_requested.connect(self._on_selection_color_requested)

        # Connect metrics table signals
        self._metrics_table.protein_selected.connect(self._on_metrics_protein_selected)
        self._metrics_table.protein_double_clicked.connect(self._on_metrics_protein_double_clicked)
        self._metrics_table.filters_changed.connect(self._plot_panel.set_filters)

        # Connect plot panel signals
        self._plot_panel.protein_selected.connect(self._on_plot_protein_selected)

        # Connect grouping-related signals
        self._file_list.grouping_mode_changed.connect(self._on_grouping_mode_changed)
        self._selection_panel.binder_search_requested.connect(self._on_binder_search_requested)
        self._selection_panel.binder_result_selected.connect(self._on_binder_result_selected)
        self._selection_panel.binder_group_requested.connect(self._on_binder_group_requested)
        self._selection_panel.create_group_from_chain_requested.connect(
            self._on_create_group_from_chain
        )

        # Connect filter changes to save config
        self._metrics_table.filters_changed.connect(self._on_filters_changed)

    def _on_open_folder(self):
        """Handle File > Open Folder action."""
        # Use non-native dialog to ensure files are visible while selecting folder
        dialog = QFileDialog(self, "Select Folder with Protein Files")
        dialog.setFileMode(QFileDialog.FileMode.Directory)
        dialog.setOption(QFileDialog.Option.ShowDirsOnly, False)
        dialog.setOption(QFileDialog.Option.DontUseNativeDialog, True)
        dialog.setNameFilters(["Protein files (*.pdb *.cif)", "JSON files (*.json)", "All files (*)"])

        if dialog.exec() == QFileDialog.DialogCode.Accepted:
            folder = dialog.selectedFiles()[0]
            self._current_folder = folder
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
        self._load_protein(file_path)

    def _load_protein(self, file_path: str) -> None:
        """Load a protein from file path.

        Args:
            file_path: Path to the protein structure file.
        """
        logger.debug(f"MainWindow._load_protein: loading {file_path}")
        self._statusbar.showMessage(f"Loading: {file_path}")

        # Load protein model FIRST (before viewer emits structure_loaded signal)
        # This fixes race condition where signal fires before _current_protein is set
        try:
            self._current_protein = Protein(file_path)
            # Pre-load structure for faster metric calculation
            _ = self._current_protein.structure
            logger.debug(f"MainWindow._load_protein: Protein model created successfully")
        except Exception as e:
            logger.error(f"MainWindow._load_protein: failed to create Protein model: {e}")
            self._statusbar.showMessage(f"Warning: Could not load structure model: {e}")
            self._current_protein = None

        # Now load in viewer (structure_loaded signal will have valid _current_protein)
        logger.debug(f"MainWindow._load_protein: calling viewer.load_structure()")
        self._viewer.load_structure(file_path)

    def _on_folder_changed(self, folder_path: str):
        """Handle folder change.

        Args:
            folder_path: Path to the new folder.
        """
        logger.info(f"Folder changed to: {folder_path}")
        # Clear cached proteins from previous folder to free memory
        self._grouping_manager.clear()

        self._current_folder = folder_path
        count = self._file_list.file_count
        logger.info(f"Loaded {count} protein file(s) from folder")
        self._statusbar.showMessage(f"Loaded {count} file(s) from {folder_path}")

        # Auto-load metrics from JSON files in the folder
        self._auto_load_metrics(folder_path)

    def _auto_load_metrics(self, folder_path: str) -> None:
        """Automatically load metrics from JSON files found in the folder.

        Looks for JSON files that match protein files (by stem name) and loads
        their metrics (e.g., pLDDT, confidence scores from Boltz/AlphaFold).

        Args:
            folder_path: Path to the folder to scan.
        """
        try:
            json_files = get_json_files(folder_path)
        except (FileNotFoundError, NotADirectoryError):
            return

        if not json_files:
            logger.debug(f"No JSON files found in {folder_path}")
            return

        logger.info(f"Auto-loading metrics: found {len(json_files)} JSON files in {folder_path}")

        # Build a map of protein stems to their file paths
        protein_stems = {}
        for file_path in self._file_list.get_all_file_paths():
            stem = Path(file_path).stem
            protein_stems[stem] = file_path

        # Try to load metrics from each JSON file
        loaded_count = 0
        for json_file in json_files:
            json_stem = json_file.stem
            # Try to find matching PDB/CIF file
            pdb_file_path = protein_stems.get(json_stem)

            if self._metrics_store.load_single_protein_json(str(json_file), pdb_file_path):
                loaded_count += 1

        logger.info(
            f"Auto-load metrics: {loaded_count} of {len(json_files)} JSON files "
            f"matched protein files ({len(protein_stems)} proteins in folder)"
        )

        if loaded_count > 0:
            self._metrics_table.set_store(self._metrics_store)
            self._plot_panel.set_store(self._metrics_store)
            self._statusbar.showMessage(
                f"Loaded {self._file_list.file_count} file(s), "
                f"auto-imported {loaded_count} metrics from JSON"
            )

    def _on_structure_loaded(self, file_path: str):
        """Handle successful structure load.

        Args:
            file_path: Path to the loaded structure.
        """
        logger.debug(f"MainWindow._on_structure_loaded: received signal for {file_path}")
        logger.debug(f"MainWindow._on_structure_loaded: _current_protein is {'set' if self._current_protein else 'None'}")
        self._statusbar.showMessage(f"Loaded: {file_path}")

        # Update selection panel with structure info
        if self._current_protein:
            chains = self._current_protein.get_chains()
            logger.debug(f"MainWindow._on_structure_loaded: chains = {chains}")

            # Get chain lengths from sequence
            sequence = self._current_protein.get_sequence()
            chain_lengths: dict[str, int] = {}
            for res in sequence:
                chain = res.get("chain", "")
                chain_lengths[chain] = chain_lengths.get(chain, 0) + 1

            self._selection_panel.set_chains(chains, chain_lengths)

            num_residues = self._current_protein.get_num_residues()
            logger.debug(f"MainWindow._on_structure_loaded: num_residues = {num_residues}")
            self._selection_panel.set_selection_count(0, num_residues)

            # Load sequence into viewer
            logger.debug(f"MainWindow._on_structure_loaded: sequence length = {len(sequence)}")
            if sequence:
                logger.debug(f"MainWindow._on_structure_loaded: first 3 sequence entries = {sequence[:3]}")
            self._viewer.set_sequence(sequence)
            logger.debug("MainWindow._on_structure_loaded: set_sequence() called")

            # Register protein with grouping manager
            self._grouping_manager.register_protein(file_path, self._current_protein)
        else:
            logger.warning("MainWindow._on_structure_loaded: _current_protein is None, skipping sequence load")

    def _on_error(self, message: str):
        """Handle error from viewer.

        Args:
            message: Error message.
        """
        self._statusbar.showMessage(f"Error: {message}")

    def _on_selection_changed(self, selection: list[dict]):
        """Handle selection change in viewer.

        Args:
            selection: List of dicts with 'chain' and 'id' keys.
        """
        if self._current_protein:
            total = self._current_protein.get_num_residues()
            self._selection_panel.set_selection_count(len(selection), total)
            self._selection_panel.set_selected_residues(selection)

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

    # Metrics table handlers

    def _on_metrics_protein_selected(self, name: str):
        """Handle protein selection in metrics table.

        Args:
            name: Protein name.
        """
        self._statusbar.showMessage(f"Selected: {name}")

    def _load_protein_by_name(self, name: str):
        """Find and load a protein structure file by name.

        Looks up the file path from the metrics store first, then falls back
        to searching the current folder for matching .pdb/.cif files.
        """
        protein_data = self._metrics_store.get_protein(name)
        if protein_data and protein_data.file_path:
            self._load_protein(protein_data.file_path)
            return
        if self._current_folder:
            for ext in [".pdb", ".cif"]:
                file_path = Path(self._current_folder) / f"{name}{ext}"
                if file_path.exists():
                    self._load_protein(str(file_path))
                    return
        self._statusbar.showMessage(f"Could not find structure file for {name}")

    def _on_metrics_protein_double_clicked(self, name: str):
        """Handle protein double-click in metrics table."""
        self._load_protein_by_name(name)

    def _on_plot_protein_selected(self, name: str):
        """Handle protein selection from plot click."""
        self._load_protein_by_name(name)

    # Import/Export handlers

    def _on_import_csv(self):
        """Handle Import > CSV action."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Import Metrics from CSV",
            "",
            "CSV Files (*.csv);;All Files (*)",
        )
        if file_path:
            try:
                count = self._metrics_store.load_csv(file_path)
                self._metrics_table.set_store(self._metrics_store)
                self._plot_panel.set_store(self._metrics_store)
                self._left_tabs.setCurrentWidget(self._metrics_table)
                self._statusbar.showMessage(f"Imported {count} proteins from CSV")
            except Exception as e:
                QMessageBox.critical(self, "Import Error", f"Failed to import CSV: {e}")

    def _on_import_json(self):
        """Handle Import > JSON action."""
        file_path, _ = QFileDialog.getOpenFileName(
            self,
            "Import Metrics from JSON",
            "",
            "JSON Files (*.json);;All Files (*)",
        )
        if file_path:
            try:
                count = self._metrics_store.load_json(file_path)
                self._metrics_table.set_store(self._metrics_store)
                self._plot_panel.set_store(self._metrics_store)
                self._left_tabs.setCurrentWidget(self._metrics_table)
                self._statusbar.showMessage(f"Imported {count} proteins from JSON")
            except Exception as e:
                QMessageBox.critical(self, "Import Error", f"Failed to import JSON: {e}")

    def _on_export_csv(self):
        """Handle Export > CSV action."""
        if self._metrics_store.count == 0:
            QMessageBox.warning(self, "Export", "No metrics data to export")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Metrics to CSV",
            "",
            "CSV Files (*.csv);;All Files (*)",
        )
        if file_path:
            try:
                self._metrics_store.save_csv(file_path)
                self._statusbar.showMessage(f"Exported metrics to {file_path}")
            except Exception as e:
                QMessageBox.critical(self, "Export Error", f"Failed to export CSV: {e}")

    def _on_export_json(self):
        """Handle Export > JSON action."""
        if self._metrics_store.count == 0:
            QMessageBox.warning(self, "Export", "No metrics data to export")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Metrics to JSON",
            "",
            "JSON Files (*.json);;All Files (*)",
        )
        if file_path:
            try:
                self._metrics_store.save_json(file_path)
                self._statusbar.showMessage(f"Exported metrics to {file_path}")
            except Exception as e:
                QMessageBox.critical(self, "Export Error", f"Failed to export JSON: {e}")

    def _on_export_filtered_fasta(self):
        """Handle Export > Filtered Sequences to FASTA."""
        filtered_names = self._metrics_table.get_filtered_protein_names()
        if not filtered_names:
            QMessageBox.warning(self, "Export", "No proteins pass the current filters")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Filtered Sequences to FASTA",
            "",
            "FASTA Files (*.fasta *.fa);;All Files (*)",
        )
        if not file_path:
            return

        exported = 0
        try:
            with open(file_path, "w") as f:
                for name in filtered_names:
                    # Try to find structure file
                    protein_path = self._find_protein_file(name)
                    if not protein_path:
                        continue
                    try:
                        protein = Protein(protein_path)
                        sequence = protein.get_sequence()
                        if not sequence:
                            continue
                        # Group by chain
                        chains: dict[str, list[str]] = {}
                        for res in sequence:
                            chain = res.get("chain", "")
                            chains.setdefault(chain, []).append(res.get("one_letter", "X"))
                        for chain_id, letters in chains.items():
                            seq_str = "".join(letters)
                            f.write(f">{name}|chain_{chain_id}\n")
                            for i in range(0, len(seq_str), 60):
                                f.write(f"{seq_str[i:i+60]}\n")
                        exported += 1
                    except Exception as e:
                        logger.warning(f"Failed to export {name}: {e}")
            self._statusbar.showMessage(
                f"Exported {exported} of {len(filtered_names)} filtered proteins to {file_path}"
            )
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export FASTA: {e}")

    def _on_export_filtered_csv(self):
        """Handle Export > Filtered Proteins to CSV."""
        filtered_names = self._metrics_table.get_filtered_protein_names()
        if not filtered_names:
            QMessageBox.warning(self, "Export", "No proteins pass the current filters")
            return

        file_path, _ = QFileDialog.getSaveFileName(
            self,
            "Export Filtered Proteins to CSV",
            "",
            "CSV Files (*.csv);;All Files (*)",
        )
        if not file_path:
            return

        try:
            # Build filtered store and save
            metric_names = self._metrics_store.metric_names
            with open(file_path, "w") as f:
                f.write("name," + ",".join(metric_names) + "\n")
                for name in filtered_names:
                    protein = self._metrics_store.get_protein(name)
                    if not protein:
                        continue
                    values = [
                        f"{protein.get_metric(m):.4f}" if protein.has_metric(m) else ""
                        for m in metric_names
                    ]
                    f.write(f"{name},{','.join(values)}\n")
            self._statusbar.showMessage(
                f"Exported {len(filtered_names)} filtered proteins to {file_path}"
            )
        except Exception as e:
            QMessageBox.critical(self, "Export Error", f"Failed to export CSV: {e}")

    def _find_protein_file(self, name: str) -> str | None:
        """Find a protein structure file by name.

        Args:
            name: Protein name (stem).

        Returns:
            File path or None if not found.
        """
        # Check metrics store for stored file path
        protein_data = self._metrics_store.get_protein(name)
        if protein_data and protein_data.file_path:
            if Path(protein_data.file_path).exists():
                return protein_data.file_path

        # Search current folder
        if self._current_folder:
            for ext in [".pdb", ".cif"]:
                path = Path(self._current_folder) / f"{name}{ext}"
                if path.exists():
                    return str(path)
        return None

    def _on_batch_calculate(self, metric_name: str):
        """Handle batch metric calculation for all proteins in folder.

        Args:
            metric_name: Name of the metric to calculate.
        """
        if not self._current_folder:
            QMessageBox.warning(
                self,
                "No Folder Selected",
                "Please open a folder with protein files first."
            )
            return

        # Get list of protein files
        file_paths = self._file_list.get_all_file_paths()
        if not file_paths:
            QMessageBox.warning(self, "No Files", "No protein files found in folder")
            return

        # Confirm calculation
        result = QMessageBox.question(
            self,
            "Calculate Metrics",
            f"Calculate {metric_name.upper()} for {len(file_paths)} proteins?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if result != QMessageBox.StandardButton.Yes:
            return

        # Start batch calculation
        self._batch_worker = BatchMetricWorker(file_paths, metric_name)
        self._batch_worker.progress.connect(self._on_batch_progress)
        self._batch_worker.protein_done.connect(
            lambda name, res: self._on_batch_protein_done(name, res, metric_name)
        )
        self._batch_worker.error.connect(self._on_batch_error)
        self._batch_worker.finished.connect(self._on_batch_finished)
        self._batch_worker.start()

        self._statusbar.showMessage(f"Calculating {metric_name}...")

    def _on_batch_progress(self, current: int, total: int):
        """Handle batch calculation progress.

        Args:
            current: Current protein index.
            total: Total proteins.
        """
        self._statusbar.showMessage(f"Calculating metrics: {current}/{total}")

    def _on_batch_protein_done(self, name: str, result: MetricResult, metric_name: str):
        """Handle completion of a single protein metric calculation.

        Args:
            name: Protein name.
            result: MetricResult for the protein.
            metric_name: Name of the metric.
        """
        # Get or create protein in store
        protein = self._metrics_store.get_protein(name)
        if protein is None:
            # Find the file path
            file_path = None
            if self._current_folder:
                for ext in [".pdb", ".cif"]:
                    path = Path(self._current_folder) / f"{name}{ext}"
                    if path.exists():
                        file_path = str(path)
                        break
            protein = ProteinMetrics(name=name, file_path=file_path)

        # Store mean value for the protein
        if result.values:
            mean_val = sum(result.values.values()) / len(result.values)
            protein.set_metric(f"{metric_name}_mean", mean_val)
            protein.set_metric(f"{metric_name}_min", result.min_value)
            protein.set_metric(f"{metric_name}_max", result.max_value)

        self._metrics_store.add_protein(protein)

    def _on_batch_error(self, name: str, message: str):
        """Handle batch calculation error for a single protein.

        Args:
            name: Protein name.
            message: Error message.
        """
        logger.warning(f"Batch metric calculation failed for '{name}': {message}")

    def _on_batch_finished(self):
        """Handle batch calculation completion."""
        self._metrics_table.set_store(self._metrics_store)
        self._plot_panel.set_store(self._metrics_store)
        self._left_tabs.setCurrentWidget(self._metrics_table)
        self._statusbar.showMessage(
            f"Calculated metrics for {self._metrics_store.count} proteins"
        )

    def _on_clear_metrics(self):
        """Handle Clear All Metrics action."""
        if self._metrics_store.count == 0:
            return

        result = QMessageBox.question(
            self,
            "Clear Metrics",
            f"Clear metrics for {self._metrics_store.count} proteins?",
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        )
        if result == QMessageBox.StandardButton.Yes:
            self._metrics_store.clear()
            self._metrics_table.refresh()
            self._plot_panel.set_store(self._metrics_store)
            self._statusbar.showMessage("Metrics cleared")

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

    @property
    def plot_panel(self) -> PlotPanel:
        """Get the plot panel widget."""
        return self._plot_panel

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
            # Calculate binder-side interface residues
            binder_interface = self._current_protein.get_interface_residues(
                binder_chain=binder_chain,
                target_chains=target_chains,
                distance_cutoff=cutoff,
            )

            # Calculate target-side interface residues (bidirectional)
            target_interface: dict[int, str] = {}
            for target_chain in target_chains:
                target_res = self._current_protein.get_interface_residues(
                    binder_chain=target_chain,
                    target_chains=[binder_chain],
                    distance_cutoff=cutoff,
                )
                target_interface.update(target_res)

            # Build binder-side interface as chain-aware list
            binder_list = [
                {"chain": binder_chain, "id": res_id}
                for res_id in binder_interface.keys()
            ]

            # Build combined interface list for highlighting (both sides)
            interface_list = list(binder_list)
            for target_chain in target_chains:
                target_res = self._current_protein.get_interface_residues(
                    binder_chain=target_chain,
                    target_chains=[binder_chain],
                    distance_cutoff=cutoff,
                )
                for res_id in target_res:
                    interface_list.append({"chain": target_chain, "id": res_id})

            # Update selection panel with binder-side residues (chain-aware)
            self._selection_panel.set_interface_result(
                binder_list, len(target_interface)
            )
            self._viewer.set_interface_residues(interface_list)

            total = len(binder_list) + len(target_interface)
            if total > 0:
                self._statusbar.showMessage(
                    f"Interface: {len(binder_list)} binder residues ({binder_chain}), "
                    f"{len(target_interface)} target residues"
                )
            else:
                self._statusbar.showMessage("No interface residues found at this cutoff")

        except Exception as e:
            logger.error(f"Interface calculation failed: {e}", exc_info=True)
            self._statusbar.showMessage(f"Interface calculation failed: {e}")
            self._selection_panel.set_interface_result([], 0)

    def _on_select_interface(self):
        """Handle select interface residues request."""
        interface = self._selection_panel.get_interface_residues()
        if interface:
            self._viewer.select_residues(interface)
            self._statusbar.showMessage(f"Selected {len(interface)} interface residues")

    def _on_clear_interface_requested(self):
        """Handle clear interface request."""
        self._viewer.clear_interface()
        self._statusbar.showMessage("Interface highlighting cleared")

    def _on_selection_color_requested(self, color: str):
        """Handle selection coloring request.

        Args:
            color: Hex color string (e.g., '#ff0000').
        """
        self._viewer.set_selection_color(color)
        self._statusbar.showMessage(f"Applied color {color} to selection")

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

            # Build set of (chain, id) tuples for selected residues
            selected_set = {(r["chain"], r["id"]) for r in selected}
            selected_residues = [r for r in sequence if (r["chain"], r["id"]) in selected_set]

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

    # Theme handlers

    def _on_toggle_dark_mode(self) -> None:
        """Handle dark mode toggle."""
        get_theme_manager().toggle_dark_mode()

    def _on_designate_target(self) -> None:
        """Handle View > Designate Target Chains action."""
        if not self._current_protein:
            QMessageBox.warning(
                self,
                "No Structure Loaded",
                "Please load a structure first.",
            )
            return

        file_path = str(self._current_protein.file_path)
        self.show_target_designation_dialog(file_path)

    def _on_auto_detect_targets(self) -> None:
        """Handle View > Auto-Detect Targets action.

        Loads all structures and uses shared chain sequences to detect targets.
        """
        if not self._current_folder:
            QMessageBox.warning(self, "No Folder", "Please open a folder first.")
            return

        file_paths = self._file_list.get_all_file_paths()
        if len(file_paths) < 2:
            QMessageBox.warning(
                self,
                "Not Enough Structures",
                "Auto-detection needs at least 2 structures.",
            )
            return

        self._statusbar.showMessage("Auto-detecting targets...")

        # Load proteins that aren't already registered
        loaded = []
        for fp in file_paths:
            if fp in self._grouping_manager._proteins:
                loaded.append((fp, self._grouping_manager._proteins[fp]))
            else:
                try:
                    protein = Protein(fp)
                    self._grouping_manager.register_protein(fp, protein)
                    loaded.append((fp, protein))
                except Exception as e:
                    logger.warning(f"Failed to load {fp} for auto-detection: {e}")

        if len(loaded) < 2:
            QMessageBox.warning(self, "Error", "Could not load enough structures.")
            return

        designations = self._grouping_manager.auto_detect_targets(loaded)

        if not designations:
            QMessageBox.information(
                self,
                "Auto-Detect",
                "No shared target chains detected. Structures may not share a common target.",
            )
            return

        # Compute target groups and refresh
        self._grouping_manager.compute_target_groups()
        self._file_list.refresh_groups()

        target_groups = self._grouping_manager.get_target_groups()
        self._statusbar.showMessage(
            f"Auto-detected targets: {len(designations)} structures, "
            f"{len(target_groups)} target group(s)"
        )
        QMessageBox.information(
            self,
            "Auto-Detect Complete",
            f"Detected {len(designations)} binder/target complexes across "
            f"{len(target_groups)} target group(s).\n\n"
            f"Use 'Designate Target Chains' to adjust individual designations.",
        )

    def _on_theme_changed(self, theme) -> None:
        """Handle theme change.

        Args:
            theme: New Theme object.
        """
        # Update the checkbox state
        self._dark_mode_action.setChecked(theme.name == "dark")
        # Update 3D viewer background
        self._viewer.set_background_color(theme.viewer_background)
        self._statusbar.showMessage(f"Switched to {theme.name} mode")

    # Grouping handlers

    def _on_grouping_mode_changed(self, mode: str) -> None:
        """Handle grouping mode change.

        Args:
            mode: New grouping mode ("none", "sequence", "target").
        """
        if mode == "sequence":
            self._compute_sequence_groups()
        elif mode == "target":
            self._grouping_manager.compute_target_groups()
            self._file_list.refresh_groups()

        self._statusbar.showMessage(f"Grouping mode: {mode}")

    def _compute_sequence_groups(self) -> None:
        """Compute sequence groups for all proteins in current folder.

        Uses a worker thread to avoid blocking the UI.
        """
        if not self._current_folder:
            return

        file_paths = self._file_list.get_all_file_paths()
        if not file_paths:
            return

        # Cancel any existing worker
        if self._sequence_group_worker is not None:
            self._sequence_group_worker.cancel()
            self._sequence_group_worker.wait()

        self._statusbar.showMessage("Computing sequence groups...")

        # Start worker thread
        self._sequence_group_worker = SequenceGroupWorker(
            file_paths, self._grouping_manager
        )
        self._sequence_group_worker.progress.connect(self._on_sequence_group_progress)
        self._sequence_group_worker.error.connect(self._on_sequence_group_error)
        self._sequence_group_worker.finished.connect(self._on_sequence_groups_finished)
        self._sequence_group_worker.start()

    def _on_sequence_group_progress(self, current: int, total: int, name: str) -> None:
        """Handle sequence grouping progress.

        Args:
            current: Current file number.
            total: Total files.
            name: Current file name.
        """
        self._statusbar.showMessage(f"Computing groups: {current}/{total} - {name}")

    def _on_sequence_group_error(self, file_path: str, message: str) -> None:
        """Handle sequence grouping error for a file.

        Args:
            file_path: Path to the file that failed.
            message: Error message.
        """
        logger.warning(f"Failed to load {file_path} for grouping: {message}")

    def _on_sequence_groups_finished(self, proteins: list) -> None:
        """Handle sequence grouping completion.

        Args:
            proteins: List of (file_path, Protein) tuples.
        """
        self._grouping_manager.compute_sequence_groups(proteins)
        self._file_list.refresh_groups()

        groups = self._grouping_manager.get_sequence_groups()
        self._statusbar.showMessage(f"Found {len(groups)} sequence groups from {len(proteins)} structures")

    def _on_binder_search_requested(
        self,
        target_residues: list[tuple[str, int]],
        cutoff: float,
        min_target_contacts: int,
    ) -> None:
        """Handle binder search request.

        Loads all proteins from the file list into the grouping manager
        before running the spatial search.

        Args:
            target_residues: List of (chain_id, residue_id) tuples.
            cutoff: Distance cutoff in Angstroms.
            min_target_contacts: Minimum number of target residues that must
                be contacted for a binder to be included.
        """
        file_paths = self._file_list.get_all_file_paths()
        if not file_paths:
            self._selection_panel.set_binder_search_results([], 0)
            self._statusbar.showMessage("No structures loaded")
            return

        # Ensure all proteins are loaded and registered
        self._statusbar.showMessage(f"Loading {len(file_paths)} structures for search...")
        QApplication.processEvents()

        loaded_count = 0
        for fp in file_paths:
            if fp not in self._grouping_manager._proteins:
                try:
                    protein = Protein(fp)
                    self._grouping_manager.register_protein(fp, protein)
                except Exception as e:
                    logger.warning(f"Failed to load {fp} for binder search: {e}")
            loaded_count += 1

        self._statusbar.showMessage(
            f"Searching {loaded_count} structures for contacts..."
        )
        QApplication.processEvents()

        num_target_residues = len(set(target_residues))

        results = self._grouping_manager.find_binders_contacting_residues(
            target_residues,
            cutoff,
            file_paths=file_paths,
            min_target_contacts=min_target_contacts,
        )
        self._selection_panel.set_binder_search_results(
            results, loaded_count, num_target_residues
        )

        if results:
            self._statusbar.showMessage(
                f"Found {len(results)} binder(s) with contacts "
                f"(searched {loaded_count} structures)"
            )
        else:
            self._statusbar.showMessage(
                f"No binders found (searched {loaded_count} structures)"
            )

    def _on_binder_result_selected(self, file_path: str) -> None:
        """Handle binder result selection.

        Args:
            file_path: Path to selected binder structure.
        """
        self._load_protein(file_path)

    def _on_binder_group_requested(
        self, group_name: str, file_paths: list[str]
    ) -> None:
        """Create a custom group from binder search results.

        Args:
            group_name: Name for the new group.
            file_paths: File paths of matching binders.
        """
        group = self._grouping_manager.create_custom_group(
            name=group_name,
            members=file_paths,
        )
        self._file_list.refresh_groups()
        self._statusbar.showMessage(
            f"Created group '{group_name}' with {len(group.members)} structures"
        )

    def _on_create_group_from_chain(self, chain_id: str, group_name: str) -> None:
        """Handle request to create a group from structures with matching chain sequence.

        Args:
            chain_id: Chain ID to match.
            group_name: Name for the new group.
        """
        if not self._current_protein:
            self._selection_panel.set_chain_group_result(0, group_name)
            return

        # Ensure proteins are loaded for searching
        file_paths = self._file_list.get_all_file_paths()
        current_path = (
            self._current_protein.file_path
            if hasattr(self._current_protein, "file_path")
            else None
        )

        # Register current protein if not already
        if current_path and current_path not in self._grouping_manager._proteins:
            self._grouping_manager.register_protein(current_path, self._current_protein)

        # Use the grouping manager to create the group
        group = self._grouping_manager.create_group_from_chain_search(
            name=group_name,
            reference_protein=self._current_protein,
            chain_id=chain_id,
            file_paths=file_paths,
        )

        if group:
            count = len(group.members)
            self._selection_panel.set_chain_group_result(count, group_name)
            self._statusbar.showMessage(
                f"Created group '{group_name}' with {count} structures"
            )
            # Refresh file list to show custom groups if we add that display later
            self._file_list.refresh_groups()
        else:
            self._selection_panel.set_chain_group_result(0, group_name)
            self._statusbar.showMessage(
                f"No structures found with matching chain {chain_id}"
            )

    # Filter persistence handlers

    def _on_filters_changed(self, filters: dict) -> None:
        """Handle filter changes from metrics table.

        Args:
            filters: Dict of metric_name -> (min_val, max_val).
        """
        # Update plot panel
        self._plot_panel.set_filters(filters)

        # Save to config
        self._user_config.filters.metric_ranges = filters.copy()
        save_config(self._user_config)

    def _restore_settings(self) -> None:
        """Restore saved user settings."""
        vc = self._user_config.viewer

        # Restore dark mode
        if vc.dark_mode:
            get_theme_manager().set_theme("dark")
            self._dark_mode_action.setChecked(True)

        # Restore sequence viewer cell size
        self._viewer.sequence_viewer.set_cell_size(vc.cell_size)

        # Restore default interface cutoff on selection panel
        self._selection_panel.set_default_cutoff(vc.interface_cutoff)

        if self._user_config.filters.metric_ranges:
            logger.debug(
                f"Restored filter config with {len(self._user_config.filters.metric_ranges)} filters"
            )

        logger.debug(
            f"Restored viewer prefs: cell_size={vc.cell_size}, "
            f"color_scheme={vc.color_scheme}, dark_mode={vc.dark_mode}"
        )

    def closeEvent(self, event) -> None:
        """Handle window close event."""
        # Save current folder
        self._user_config.last_folder = self._current_folder

        # Save viewer preferences
        self._user_config.viewer.dark_mode = get_theme_manager().is_dark_mode
        self._user_config.viewer.cell_size = self._viewer.sequence_viewer.current_size

        save_config(self._user_config)
        event.accept()

    # Target designation

    def show_target_designation_dialog(self, file_path: str) -> bool:
        """Show dialog to designate target/binder chains.

        Args:
            file_path: Path to the structure file.

        Returns:
            True if designation was set.
        """
        if not self._current_protein:
            return False

        chains = self._current_protein.get_chains()
        sequence = self._current_protein.get_sequence()

        # Get chain lengths
        chain_lengths: dict[str, int] = {}
        for res in sequence:
            chain = res.get("chain", "")
            chain_lengths[chain] = chain_lengths.get(chain, 0) + 1

        # Check for existing designation
        existing = self._grouping_manager.get_target_designation(file_path)
        preset_targets = existing.target_chains if existing else []
        preset_binders = existing.binder_chains if existing else []

        dialog = TargetDesignationDialog(
            file_path=file_path,
            chains=chain_lengths,
            preset_targets=preset_targets,
            preset_binders=preset_binders,
            parent=self,
        )

        if dialog.exec() == dialog.DialogCode.Accepted:
            self._grouping_manager.set_target_designation(
                file_path,
                dialog.target_chains,
                dialog.binder_chains,
            )

            # Recompute target groups if in that mode
            if self._file_list.grouping_mode == "target":
                self._grouping_manager.compute_target_groups()
                self._file_list.refresh_groups()

            return True

        return False
