"""3D protein structure viewer widget using py3Dmol."""

import json
from pathlib import Path

from PyQt6.QtCore import pyqtSignal, QUrl
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWidgets import QVBoxLayout, QWidget, QLabel, QMessageBox

from src.config.settings import DEFAULT_BACKGROUND_COLOR
from src.utils.file_utils import read_protein_file, get_file_format


# HTML template for the 3Dmol.js viewer
VIEWER_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        #viewer { width: 100%; height: 100%; position: absolute; }
    </style>
    <script src="https://3Dmol.csb.pitt.edu/build/3Dmol-min.js"></script>
</head>
<body>
    <div id="viewer"></div>
    <script>
        let viewer = null;

        function initViewer() {
            let element = document.getElementById('viewer');
            let config = { backgroundColor: 'BACKGROUND_COLOR' };
            viewer = $3Dmol.createViewer(element, config);
            viewer.setViewStyle({style: 'outline'});
            viewer.render();
        }

        function loadStructure(pdbData, format) {
            if (!viewer) initViewer();
            viewer.clear();
            viewer.addModel(pdbData, format);
            viewer.setStyle({}, {cartoon: {color: 'spectrum'}});
            viewer.zoomTo();
            viewer.render();
        }

        function clearViewer() {
            if (viewer) {
                viewer.clear();
                viewer.render();
            }
        }

        function setStyle(styleSpec) {
            if (viewer) {
                viewer.setStyle({}, styleSpec);
                viewer.render();
            }
        }

        // Initialize on load
        document.addEventListener('DOMContentLoaded', initViewer);
    </script>
</body>
</html>
""".replace('BACKGROUND_COLOR', DEFAULT_BACKGROUND_COLOR)


class ProteinViewer(QWidget):
    """Widget for displaying 3D protein structures using py3Dmol.

    Signals:
        structure_loaded: Emitted when a structure is successfully loaded.
        error_occurred: Emitted when an error occurs (with error message).
    """

    structure_loaded = pyqtSignal(str)  # Emits the file path
    error_occurred = pyqtSignal(str)  # Emits error message

    def __init__(self, parent=None):
        """Initialize the protein viewer widget.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self._current_file: str | None = None
        self._init_ui()

    def _init_ui(self):
        """Initialize the UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header label for protein name
        self._header = QLabel("No structure loaded")
        self._header.setStyleSheet(
            "QLabel { background-color: #f0f0f0; padding: 8px; font-weight: bold; }"
        )
        layout.addWidget(self._header)

        # WebEngine view for 3Dmol
        self._web_view = QWebEngineView()
        self._web_view.setHtml(VIEWER_HTML)
        layout.addWidget(self._web_view, 1)  # Stretch factor 1 to fill space

    def load_structure(self, file_path: str) -> None:
        """Load and display a protein structure from a file.

        Args:
            file_path: Path to the protein structure file.
        """
        try:
            # Read the file contents
            pdb_data = read_protein_file(file_path)
            file_format = get_file_format(file_path)

            # Determine format string for 3Dmol
            format_map = {".pdb": "pdb", ".cif": "cif"}
            mol_format = format_map.get(file_format, "pdb")

            # Escape the data for JavaScript
            pdb_data_escaped = json.dumps(pdb_data)

            # Load structure in the viewer
            js_code = f"loadStructure({pdb_data_escaped}, '{mol_format}');"
            self._web_view.page().runJavaScript(js_code)

            # Update header
            protein_name = Path(file_path).stem
            self._header.setText(f"Structure: {protein_name}")

            self._current_file = file_path
            self.structure_loaded.emit(file_path)

        except FileNotFoundError as e:
            self._show_error("File Not Found", str(e))
        except ValueError as e:
            self._show_error("Invalid Format", str(e))
        except Exception as e:
            self._show_error("Error Loading Structure", str(e))

    def clear(self) -> None:
        """Clear the current structure from the viewer."""
        self._web_view.page().runJavaScript("clearViewer();")
        self._header.setText("No structure loaded")
        self._current_file = None

    def set_style(self, style: str) -> None:
        """Set the visualization style.

        Args:
            style: Style name ('cartoon', 'stick', 'sphere', 'line').
        """
        style_specs = {
            "cartoon": "{cartoon: {color: 'spectrum'}}",
            "stick": "{stick: {}}",
            "sphere": "{sphere: {}}",
            "line": "{line: {}}",
            "surface": "{surface: {opacity: 0.8}}",
        }
        spec = style_specs.get(style, style_specs["cartoon"])
        self._web_view.page().runJavaScript(f"setStyle({spec});")

    def _show_error(self, title: str, message: str) -> None:
        """Show an error dialog and emit error signal.

        Args:
            title: Dialog title.
            message: Error message.
        """
        self.error_occurred.emit(message)
        QMessageBox.critical(self, title, message)

    @property
    def current_file(self) -> str | None:
        """Get the path of the currently loaded file."""
        return self._current_file
