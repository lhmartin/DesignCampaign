"""3D protein structure viewer widget using py3Dmol."""

import json
import logging
from pathlib import Path
from typing import Any

from PyQt6.QtCore import pyqtSignal, pyqtSlot, QObject
from PyQt6.QtWebEngineWidgets import QWebEngineView
from PyQt6.QtWebChannel import QWebChannel
from PyQt6.QtWidgets import QVBoxLayout, QWidget, QLabel, QMessageBox

from src.config.settings import DEFAULT_BACKGROUND_COLOR, Theme
from src.config.theme_manager import get_theme_manager
from src.ui.sequence_viewer import SequenceViewer
from src.config.color_schemes import (
    ColorScheme,
    SpectrumScheme,
    get_color_scheme,
    get_available_schemes,
)
from src.utils.file_utils import read_protein_file, get_file_format

logger = logging.getLogger(__name__)


# HTML template for the 3Dmol.js viewer with selection and coloring support
VIEWER_HTML = """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        * { margin: 0; padding: 0; }
        html, body { width: 100%; height: 100%; overflow: hidden; }
        #viewer { width: 100%; height: 100%; position: absolute; cursor: crosshair; }
        .selection-highlight {
            stroke: #ffff00;
            stroke-width: 2px;
        }
    </style>
    <script src="https://3Dmol.csb.pitt.edu/build/3Dmol-min.js"></script>
    <script src="qrc:///qtwebchannel/qwebchannel.js"></script>
</head>
<body>
    <div id="viewer"></div>
    <script>
        // Initialize QWebChannel bridge to Python
        var pyBridge = null;
        new QWebChannel(qt.webChannelTransport, function(channel) {
            pyBridge = channel.objects.pyBridge;
            window.pyBridge = pyBridge;
        });
    </script>
    <script>
        let viewer = null;
        // Store selected residues as array of {chain, resi} objects
        let selectedResidues = [];
        let currentStyle = 'cartoon';
        let currentColorScheme = 'spectrum';
        let metricColorMap = {};

        // Chain colors matching CHAIN_COLORS in color_schemes.py
        const CHAIN_COLORS = [
            '#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
            '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'
        ];
        let chainColorMap = {};  // chain_id -> color, built on structure load

        function buildChainColorMap() {
            chainColorMap = {};
            if (!viewer) return;
            let atoms = viewer.getModel().selectedAtoms({});
            let chains = [];
            let seen = new Set();
            atoms.forEach(function(atom) {
                if (!seen.has(atom.chain)) {
                    seen.add(atom.chain);
                    chains.push(atom.chain);
                }
            });
            chains.sort();
            chains.forEach(function(chain, i) {
                chainColorMap[chain] = CHAIN_COLORS[i % CHAIN_COLORS.length];
            });
        }

        // Helper to check if a residue is selected
        function isSelected(chain, resi) {
            return selectedResidues.some(r => r.chain === chain && r.resi === resi);
        }

        // Helper to find index of selected residue
        function findSelectedIndex(chain, resi) {
            return selectedResidues.findIndex(r => r.chain === chain && r.resi === resi);
        }

        function initViewer() {
            let element = document.getElementById('viewer');
            let config = { backgroundColor: 'BACKGROUND_COLOR' };
            viewer = $3Dmol.createViewer(element, config);
            viewer.setViewStyle({style: 'outline'});

            // Add click handler for residue selection
            viewer.setClickable({}, true, function(atom, viewer, event, container) {
                if (atom) {
                    handleAtomClick(atom, event.ctrlKey || event.metaKey);
                }
            });

            viewer.render();
        }

        let hoveredResidue = null;

        function loadStructure(pdbData, format) {
            if (!viewer) initViewer();
            viewer.clear();
            selectedResidues = [];
            metricColorMap = {};
            hoveredResidue = null;
            viewer.addModel(pdbData, format);

            // Re-register click handler after loading new model
            // (setClickable must be called after atoms exist)
            viewer.setClickable({}, true, function(atom, viewer, event, container) {
                if (atom) {
                    handleAtomClick(atom, event.ctrlKey || event.metaKey);
                }
            });

            // Add hover effect to make selection easier - highlights entire residue on hover
            viewer.setHoverable({}, true,
                function(atom, viewer, event, container) {
                    // Mouse enter - highlight the hovered residue
                    if (atom && (hoveredResidue === null ||
                        hoveredResidue.chain !== atom.chain ||
                        hoveredResidue.resi !== atom.resi)) {

                        // Clear previous hover highlight
                        if (hoveredResidue) {
                            applyCurrentStyle();
                        }

                        hoveredResidue = {chain: atom.chain, resi: atom.resi};

                        // Add hover highlight (cyan) unless already selected
                        if (!isSelected(atom.chain, atom.resi)) {
                            viewer.addStyle({chain: atom.chain, resi: atom.resi}, {
                                cartoon: {color: '#00ffff', opacity: 0.9},
                                stick: {color: '#00ffff', radius: 0.25}
                            });
                        }
                        viewer.render();
                    }
                },
                function(atom, viewer, event, container) {
                    // Mouse leave - remove hover highlight
                    if (hoveredResidue) {
                        hoveredResidue = null;
                        applyCurrentStyle();
                        viewer.render();
                    }
                }
            );

            buildChainColorMap();
            applyCurrentStyle();
            viewer.zoomTo();
            viewer.render();
        }

        function clearViewer() {
            if (viewer) {
                viewer.clear();
                selectedResidues = [];
                metricColorMap = {};
                viewer.render();
            }
        }

        function setBackgroundColor(color) {
            if (viewer) {
                viewer.setBackgroundColor(color);
                viewer.render();
            }
        }

        function setStyle(styleSpec) {
            if (viewer) {
                viewer.setStyle({}, styleSpec);
                highlightSelection();
                viewer.render();
            }
        }

        function setRepresentation(rep) {
            currentStyle = rep;
            applyCurrentStyle();
        }

        function applyCurrentStyle() {
            if (!viewer) return;

            let styleSpec = getStyleSpec(currentStyle, currentColorScheme);
            viewer.setStyle({}, styleSpec);
            highlightSelection();
            viewer.render();
        }

        function getStyleSpec(style, colorScheme) {
            let colorSpec;

            if (colorScheme === 'spectrum') {
                colorSpec = {color: 'spectrum'};
            } else if (colorScheme === 'chain') {
                colorSpec = {
                    colorfunc: function(atom) {
                        return chainColorMap[atom.chain] || '#808080';
                    }
                };
            } else if (colorScheme === 'ssJmol') {
                colorSpec = {colorscheme: 'ssJmol'};
            } else if (colorScheme === 'bfactor') {
                colorSpec = {colorscheme: {prop: 'b', gradient: 'rwb', min: 0, max: 100}};
            } else if (colorScheme === 'metric' && Object.keys(metricColorMap).length > 0) {
                colorSpec = {
                    colorfunc: function(atom) {
                        return metricColorMap[atom.resi] || '#808080';
                    }
                };
            } else if (colorScheme === 'hydrophobicity') {
                colorSpec = {
                    colorfunc: function(atom) {
                        var hydro = {
                            'ALA': 1.8, 'ARG': -4.5, 'ASN': -3.5, 'ASP': -3.5, 'CYS': 2.5,
                            'GLN': -3.5, 'GLU': -3.5, 'GLY': -0.4, 'HIS': -3.2, 'ILE': 4.5,
                            'LEU': 3.8, 'LYS': -3.9, 'MET': 1.9, 'PHE': 2.8, 'PRO': -1.6,
                            'SER': -0.8, 'THR': -0.7, 'TRP': -0.9, 'TYR': -1.3, 'VAL': 4.2
                        };
                        var val = hydro[atom.resn] || 0;
                        var norm = (val + 4.5) / 9.0;
                        var r = Math.round(255 * norm);
                        var b = Math.round(255 * (1 - norm));
                        return 'rgb(' + r + ',0,' + b + ')';
                    }
                };
            } else {
                colorSpec = {color: 'spectrum'};
            }

            let spec = {};
            spec[style] = colorSpec;

            // Add opacity for surface
            if (style === 'surface') {
                spec[style].opacity = 0.8;
            }

            return spec;
        }

        function setColorScheme(scheme) {
            currentColorScheme = scheme;
            applyCurrentStyle();
        }

        function setMetricColors(colorMap) {
            metricColorMap = colorMap;
            if (currentColorScheme === 'metric') {
                applyCurrentStyle();
            }
        }

        function handleAtomClick(atom, multiSelect) {
            let chain = atom.chain;
            let resi = atom.resi;

            if (!multiSelect) {
                selectedResidues = [];
            }

            let idx = findSelectedIndex(chain, resi);
            if (idx >= 0) {
                // Remove from selection
                selectedResidues.splice(idx, 1);
            } else {
                // Add to selection
                selectedResidues.push({chain: chain, resi: resi});
            }

            highlightSelection();
            viewer.render();

            // Notify Python of selection change
            if (window.pyBridge) {
                window.pyBridge.onSelectionChanged(JSON.stringify(selectedResidues));
            }
        }

        function highlightSelection() {
            if (!viewer || selectedResidues.length === 0) return;

            // Add highlight style to selected residues - must filter by both chain and resi
            selectedResidues.forEach(function(sel) {
                viewer.setStyle({chain: sel.chain, resi: sel.resi}, {
                    cartoon: {color: '#ffff00'},
                    stick: {color: '#ffff00', radius: 0.2}
                }, true);  // Add to existing style
            });
        }

        // residues is array of {chain, resi} objects
        function selectResidues(residues, addToSelection) {
            if (!addToSelection) {
                selectedResidues = [];
            }

            residues.forEach(function(sel) {
                if (!isSelected(sel.chain, sel.resi)) {
                    selectedResidues.push({chain: sel.chain, resi: sel.resi});
                }
            });

            applyCurrentStyle();
        }

        function selectRange(start, end, chain) {
            if (!viewer) return;

            let atoms = viewer.getModel().selectedAtoms({});
            let toSelect = [];
            let seen = new Set();

            atoms.forEach(function(atom) {
                if (atom.resi >= start && atom.resi <= end) {
                    if (!chain || atom.chain === chain) {
                        let key = atom.chain + ':' + atom.resi;
                        if (!seen.has(key)) {
                            seen.add(key);
                            toSelect.push({chain: atom.chain, resi: atom.resi});
                        }
                    }
                }
            });

            selectResidues(toSelect, false);
        }

        function selectByChain(chainId) {
            if (!viewer) return;

            let atoms = viewer.getModel().selectedAtoms({chain: chainId});
            let toSelect = [];
            let seen = new Set();

            atoms.forEach(function(atom) {
                let key = atom.chain + ':' + atom.resi;
                if (!seen.has(key)) {
                    seen.add(key);
                    toSelect.push({chain: atom.chain, resi: atom.resi});
                }
            });
            selectResidues(toSelect, false);
        }

        function selectAll() {
            if (!viewer) return;

            let atoms = viewer.getModel().selectedAtoms({});
            let toSelect = [];
            let seen = new Set();

            atoms.forEach(function(atom) {
                let key = atom.chain + ':' + atom.resi;
                if (!seen.has(key)) {
                    seen.add(key);
                    toSelect.push({chain: atom.chain, resi: atom.resi});
                }
            });
            selectResidues(toSelect, false);
        }

        function clearSelection() {
            selectedResidues = [];
            applyCurrentStyle();
        }

        function invertSelection() {
            if (!viewer) return;

            let atoms = viewer.getModel().selectedAtoms({});
            let allResidues = [];
            let seen = new Set();

            atoms.forEach(function(atom) {
                let key = atom.chain + ':' + atom.resi;
                if (!seen.has(key)) {
                    seen.add(key);
                    allResidues.push({chain: atom.chain, resi: atom.resi});
                }
            });

            // Filter to get residues NOT currently selected
            let newSelection = allResidues.filter(function(r) {
                return !isSelected(r.chain, r.resi);
            });

            selectedResidues = newSelection;
            applyCurrentStyle();
        }

        function getSelection() {
            return JSON.stringify(selectedResidues);
        }

        function zoomToSelection() {
            if (!viewer || selectedResidues.length === 0) return;
            // Build selector for all selected residues
            let selectors = selectedResidues.map(s => ({chain: s.chain, resi: s.resi}));
            // Zoom to first selected residue for now (3Dmol limitation)
            viewer.zoomTo({chain: selectors[0].chain, resi: selectors[0].resi});
            viewer.render();
        }

        function centerView() {
            if (viewer) {
                viewer.zoomTo();
                viewer.render();
            }
        }

        function setSelectionColor(color) {
            if (!viewer || selectedResidues.length === 0) return;

            let styleSpec = {};
            styleSpec[currentStyle] = {color: color};

            // Apply color to each selected residue individually (chain-aware)
            selectedResidues.forEach(function(sel) {
                viewer.setStyle({chain: sel.chain, resi: sel.resi}, styleSpec);
            });
            viewer.render();
        }

        // Interface residue highlighting - stores [{chain, resi}] objects
        let interfaceResidues = [];

        function highlightInterfaceResidues(residueList) {
            // residueList is array of {chain, resi} objects
            interfaceResidues = residueList || [];
            applyCurrentStyle();

            // Add highlight to interface residues, per-chain for correctness
            interfaceResidues.forEach(function(res) {
                viewer.addStyle({chain: res.chain, resi: res.resi}, {
                    cartoon: {color: '#ff8c00'},
                    stick: {color: '#ff8c00', radius: 0.15}
                });
            });
            if (interfaceResidues.length > 0) {
                viewer.render();
            }
        }

        function clearInterfaceHighlight() {
            interfaceResidues = [];
            applyCurrentStyle();
        }

        // Initialize on load
        document.addEventListener('DOMContentLoaded', initViewer);
    </script>
</body>
</html>
""".replace('BACKGROUND_COLOR', DEFAULT_BACKGROUND_COLOR)


class SelectionBridge(QObject):
    """Bridge object for receiving selection changes from JavaScript."""

    selection_changed = pyqtSignal(str)  # JSON string of selected residues

    @pyqtSlot(str)
    def onSelectionChanged(self, residues_json: str):
        """Called from JavaScript when selection changes.

        Args:
            residues_json: JSON string of selected residues [{chain, resi}, ...].
        """
        self.selection_changed.emit(residues_json)


class ProteinViewer(QWidget):
    """Widget for displaying 3D protein structures using py3Dmol.

    Signals:
        structure_loaded: Emitted when a structure is successfully loaded.
        error_occurred: Emitted when an error occurs (with error message).
        selection_changed: Emitted when residue selection changes (list of {chain, id} dicts).
    """

    structure_loaded = pyqtSignal(str)  # Emits the file path
    error_occurred = pyqtSignal(str)  # Emits error message
    selection_changed = pyqtSignal(list)  # Emits list of {chain, id} dicts

    def __init__(self, parent=None):
        """Initialize the protein viewer widget.

        Args:
            parent: Parent widget.
        """
        super().__init__(parent)
        self._current_file: str | None = None
        self._current_scheme: ColorScheme = SpectrumScheme()
        self._current_style: str = "cartoon"
        self._selected_residues: list[dict] = []  # List of {chain, id} dicts
        self._interface_residues: list[dict] = []  # List of {chain, id} dicts
        self._init_ui()
        self._setup_theme_listener()

    def _init_ui(self):
        """Initialize the UI components."""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        # Header label for protein name
        self._header = QLabel("No structure loaded")
        self._header.setStyleSheet(
            "QLabel { padding: 8px; font-weight: bold; }"
        )
        layout.addWidget(self._header)

        # Sequence viewer (above 3D view)
        self._sequence_viewer = SequenceViewer()
        self._sequence_viewer.selection_changed.connect(self._on_sequence_selection_changed)
        layout.addWidget(self._sequence_viewer)

        # WebEngine view for 3Dmol
        self._web_view = QWebEngineView()

        # Set up QWebChannel bridge for JavaScript → Python communication
        self._selection_bridge = SelectionBridge()
        self._selection_bridge.selection_changed.connect(self._on_3d_selection_changed)
        self._web_channel = QWebChannel()
        self._web_channel.registerObject("pyBridge", self._selection_bridge)
        self._web_view.page().setWebChannel(self._web_channel)

        self._web_view.setHtml(VIEWER_HTML)
        self._web_ready = False
        self._web_view.loadFinished.connect(self._on_web_load_finished)
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
            self._selected_residues = []
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
        self._selected_residues = []  # List of {chain, id} dicts
        self._interface_residues = []  # List of {chain, id} dicts
        self._sequence_viewer.clear()

    def _on_web_load_finished(self, ok: bool) -> None:
        """Handle web view page load completion."""
        if ok:
            self._web_ready = True
            # Apply pending theme now that JS functions are available
            theme_manager = get_theme_manager()
            self.set_background_color(theme_manager.current_theme.viewer_background)

    def set_background_color(self, color: str) -> None:
        """Set the 3D viewer background color.

        Args:
            color: CSS color string (e.g., 'white', '#1e1e1e').
        """
        if not self._web_ready:
            return
        self._web_view.page().runJavaScript(f"setBackgroundColor('{color}');")

    def set_style(self, style: str) -> None:
        """Set the visualization style.

        Args:
            style: Style name ('cartoon', 'stick', 'sphere', 'line', 'surface').
        """
        self._current_style = style
        self._web_view.page().runJavaScript(f"setRepresentation('{style}');")

    def set_color_scheme(self, scheme_name: str) -> None:
        """Set the color scheme.

        Args:
            scheme_name: Color scheme name ('spectrum', 'chain', 'secondary_structure', etc.).
        """
        scheme_map = {
            "spectrum": "spectrum",
            "chain": "chain",
            "secondary_structure": "ssJmol",
            "b_factor": "bfactor",
            "hydrophobicity": "hydrophobicity",
        }
        js_scheme = scheme_map.get(scheme_name, "spectrum")
        self._web_view.page().runJavaScript(f"setColorScheme('{js_scheme}');")

    def set_metric_coloring(self, metric_values: dict[int, float], min_val: float = 0.0, max_val: float = 1.0) -> None:
        """Set coloring based on per-residue metric values.

        Args:
            metric_values: Dict mapping residue IDs to metric values.
            min_val: Minimum value for color scale.
            max_val: Maximum value for color scale.
        """
        # Convert values to colors
        # Use int() to convert numpy.int64 keys to Python int for JSON serialization
        color_map = {}
        range_val = max_val - min_val if max_val != min_val else 1.0

        for res_id, val in metric_values.items():
            norm = (val - min_val) / range_val
            norm = max(0.0, min(1.0, norm))
            color = self._value_to_color(norm)
            color_map[int(res_id)] = color  # Ensure Python int for JSON

        js_map = json.dumps(color_map)
        self._web_view.page().runJavaScript(f"setMetricColors({js_map});")
        self._web_view.page().runJavaScript("setColorScheme('metric');")

    def _value_to_color(self, norm: float) -> str:
        """Convert normalized value [0,1] to hex color (blue-white-red).

        Args:
            norm: Normalized value between 0 and 1.

        Returns:
            Hex color string.
        """
        if norm < 0.5:
            t = norm * 2
            r = int(255 * t)
            g = int(255 * t)
            b = 255
        else:
            t = (norm - 0.5) * 2
            r = 255
            g = int(255 * (1 - t))
            b = int(255 * (1 - t))
        return f"#{r:02x}{g:02x}{b:02x}"

    # Selection methods
    def select_residues(self, residues: list[dict], add_to_selection: bool = False) -> None:
        """Select specific residues.

        Args:
            residues: List of dicts with 'chain' and 'id' keys.
            add_to_selection: If True, add to current selection; otherwise replace.
        """
        # Convert to JavaScript format (chain, resi)
        js_residues = [{"chain": r["chain"], "resi": r["id"]} for r in residues]
        residues_json = json.dumps(js_residues)
        add_flag = "true" if add_to_selection else "false"
        self._web_view.page().runJavaScript(f"selectResidues({residues_json}, {add_flag});")

        if add_to_selection:
            self._selected_residues.extend(residues)
        else:
            self._selected_residues = residues.copy()

        self.selection_changed.emit(self._selected_residues)

    def select_range(self, start: int, end: int, chain: str | None = None) -> None:
        """Select a range of residues.

        Args:
            start: Start residue ID.
            end: End residue ID.
            chain: Optional chain ID to limit selection.
        """
        chain_str = f"'{chain}'" if chain else "null"
        self._web_view.page().runJavaScript(f"selectRange({start}, {end}, {chain_str});")

    def select_chain(self, chain_id: str) -> None:
        """Select all residues in a chain.

        Args:
            chain_id: Chain identifier.
        """
        self._web_view.page().runJavaScript(f"selectByChain('{chain_id}');")

    def select_all(self) -> None:
        """Select all residues."""
        self._web_view.page().runJavaScript("selectAll();")

    def clear_selection(self) -> None:
        """Clear the current selection."""
        self._web_view.page().runJavaScript("clearSelection();")
        self._selected_residues = []  # List of {chain, id} dicts
        self.selection_changed.emit([])

    def invert_selection(self) -> None:
        """Invert the current selection."""
        self._web_view.page().runJavaScript("invertSelection();")

    def zoom_to_selection(self) -> None:
        """Zoom the view to the current selection."""
        self._web_view.page().runJavaScript("zoomToSelection();")

    def center_view(self) -> None:
        """Center the view on the entire structure."""
        self._web_view.page().runJavaScript("centerView();")

    def set_selection_color(self, color: str) -> None:
        """Set the color of selected residues.

        Args:
            color: Hex color string (e.g., '#ff0000').
        """
        self._web_view.page().runJavaScript(f"setSelectionColor('{color}');")

    @property
    def selected_residues(self) -> list[dict]:
        """Get the currently selected residues as list of {chain, id} dicts."""
        return self._selected_residues.copy()

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

    @staticmethod
    def get_available_color_schemes() -> list[str]:
        """Get list of available color scheme names."""
        return get_available_schemes() + ["metric"]

    @staticmethod
    def get_available_styles() -> list[str]:
        """Get list of available visualization styles."""
        return ["cartoon", "stick", "sphere", "line", "surface"]

    # Sequence viewer methods

    def set_sequence(self, sequence: list[dict]) -> None:
        """Set the sequence to display in the sequence viewer.

        Args:
            sequence: List of residue dicts with 'id', 'one_letter', 'name', 'chain'.
        """
        logger.debug(f"ProteinViewer.set_sequence: received {len(sequence)} residues")
        if sequence:
            logger.debug(f"ProteinViewer.set_sequence: first 3 = {sequence[:3]}")
        self._sequence_viewer.set_sequence(sequence)
        logger.debug("ProteinViewer.set_sequence: called _sequence_viewer.set_sequence()")

    def set_interface_residues(self, interface: list[dict]) -> None:
        """Highlight interface residues in the viewer.

        Args:
            interface: List of dicts with 'chain' and 'id' keys.
        """
        self._interface_residues = interface.copy()
        self._sequence_viewer.set_interface_residues(interface)

        # Highlight in 3D viewer with chain-aware data
        if interface:
            js_residues = [{"chain": r["chain"], "resi": r["id"]} for r in interface]
            residues_json = json.dumps(js_residues)
            self._web_view.page().runJavaScript(
                f"highlightInterfaceResidues({residues_json});"
            )

    def clear_interface(self) -> None:
        """Clear interface residue highlighting."""
        self._interface_residues = []
        self._sequence_viewer.clear_interface()
        self._web_view.page().runJavaScript("clearInterfaceHighlight();")

    def _on_sequence_selection_changed(self, selection: list[dict]) -> None:
        """Handle selection change from sequence viewer.

        Args:
            selection: List of dicts with 'chain' and 'id' keys.
        """
        # Update 3D viewer selection
        self.select_residues(selection, add_to_selection=False)

    def _on_3d_selection_changed(self, residues_json: str) -> None:
        """Handle selection change from 3D viewer (via JavaScript bridge).

        Args:
            residues_json: JSON string of selected residues [{chain, resi}, ...].
        """
        try:
            residues = json.loads(residues_json)
            # Convert JavaScript format {chain, resi} to Python format {chain, id}
            self._selected_residues = [
                {"chain": r["chain"], "id": r["resi"]}
                for r in residues
            ]
            # Sync selection to sequence viewer
            self._sequence_viewer.set_selection(self._selected_residues)
            # Emit signal to notify other components
            self.selection_changed.emit(self._selected_residues)
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Error parsing 3D selection: {e}")

    def sync_selection_to_sequence(self) -> None:
        """Sync the current 3D selection to the sequence viewer."""
        self._sequence_viewer.set_selection(self._selected_residues)

    def set_sequence_coloring(self, color_map: dict[int, str]) -> None:
        """Apply coloring to the sequence viewer.

        Args:
            color_map: Dict mapping residue IDs to hex color strings.
        """
        self._sequence_viewer.set_coloring(color_map)

    def clear_sequence_coloring(self) -> None:
        """Clear coloring from the sequence viewer."""
        self._sequence_viewer.clear_coloring()

    def _setup_theme_listener(self) -> None:
        """Set up theme change listener."""
        theme_manager = get_theme_manager()
        theme_manager.add_listener(self._on_theme_changed)
        # Apply current theme
        self._on_theme_changed(theme_manager.current_theme)

    def _on_theme_changed(self, theme: Theme) -> None:
        """Handle theme change - update header and 3D viewer background."""
        self._header.setStyleSheet(
            f"QLabel {{ background-color: {theme.secondary_background}; "
            f"padding: 8px; font-weight: bold; color: {theme.text_primary}; }}"
        )
        self.set_background_color(theme.viewer_background)

    @property
    def sequence_viewer(self) -> SequenceViewer:
        """Get the sequence viewer widget."""
        return self._sequence_viewer

    @property
    def interface_residues(self) -> list[dict]:
        """Get the current interface residues as list of {chain, id} dicts."""
        return self._interface_residues.copy()
