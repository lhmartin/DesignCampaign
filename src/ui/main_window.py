"""Main application window for DesignCampaign."""

from PyQt6.QtCore import Qt
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


class MainWindow(QMainWindow):
    """Main application window with file list and protein viewer."""

    def __init__(self):
        """Initialize the main window."""
        super().__init__()
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

        # Horizontal splitter for left (file list) and right (viewer) panels
        self._splitter = QSplitter(Qt.Orientation.Horizontal)

        # Left panel: File list
        self._file_list = FileListWidget()
        self._splitter.addWidget(self._file_list)

        # Right panel: Protein viewer
        self._viewer = ProteinViewer()
        self._splitter.addWidget(self._viewer)

        # Set initial splitter sizes (25% left, 75% right)
        total_width = DEFAULT_WINDOW_WIDTH
        left_width = int(total_width * LEFT_PANEL_RATIO)
        right_width = total_width - left_width
        self._splitter.setSizes([left_width, right_width])

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
        clear_action.triggered.connect(self._viewer.clear)
        view_menu.addAction(clear_action)

        view_menu.addSeparator()

        # Style submenu
        style_menu = view_menu.addMenu("&Style")
        for style in ["cartoon", "stick", "sphere", "line", "surface"]:
            action = QAction(style.capitalize(), self)
            action.triggered.connect(lambda checked, s=style: self._viewer.set_style(s))
            style_menu.addAction(action)

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

    def _on_file_selected(self, file_path: str):
        """Handle file selection from the file list.

        Args:
            file_path: Path to the selected file.
        """
        self._statusbar.showMessage(f"Loading: {file_path}")
        self._viewer.load_structure(file_path)

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

    def _on_error(self, message: str):
        """Handle error from viewer.

        Args:
            message: Error message.
        """
        self._statusbar.showMessage(f"Error: {message}")

    @property
    def file_list(self) -> FileListWidget:
        """Get the file list widget."""
        return self._file_list

    @property
    def viewer(self) -> ProteinViewer:
        """Get the protein viewer widget."""
        return self._viewer
