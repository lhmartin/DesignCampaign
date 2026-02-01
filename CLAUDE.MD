# CLAUDE.MD - Design Campaign Protein Viewer Project

## Project Overview

**DesignCampaign** is an open-source Python application for viewing, selecting, and filtering large design campaigns for protein drug design. The application integrates 3D protein structure visualization, metrics display, and simple structural calculations.

## Technology Stack

- **Language**: Python 3.10+
- **Package Manager**: uv (modern, fast Python package manager)
- **GUI Framework**: PyQt6 (modern, cross-platform UI framework)
- **3D Visualization**: py3Dmol (web-based molecular viewer) or PyMOL
- **Structure Parsing**: biotite (high-performance, vectorized structure analysis)
- **Data Handling**: Pandas (for metrics and data analysis) + NumPy (for vectorized operations)
- **Testing**: pytest

## Project Structure

```
DesignCampaign/
├── src/
│   ├── __init__.py
│   ├── main.py              # Application entry point
│   ├── ui/
│   │   ├── __init__.py
│   │   ├── main_window.py   # Main application window
│   │   ├── file_list.py     # File list widget (left panel)
│   │   └── viewer.py        # 3D protein viewer widget (right panel)
│   ├── models/
│   │   ├── __init__.py
│   │   └── protein.py       # Protein data model
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── file_utils.py    # File handling utilities
│   │   └── structure_utils.py # Structure calculation utilities
│   └── config/
│       ├── __init__.py
│       └── settings.py      # Application settings
├── tests/
│   ├── __init__.py
│   ├── test_file_utils.py
│   └── test_protein.py
├── examples/
│   └── sample_proteins/     # Sample PDB files for testing
├── docs/
├── pyproject.toml           # Project config and dependencies (uv)
├── uv.lock                  # Lockfile for reproducible installs
├── README.md
├── CLAUDE.MD
├── LICENSE
└── .gitignore
```

## Architecture Principles

### 1. Separation of Concerns
- **UI Layer** (`src/ui/`): All GUI components and user interactions
- **Model Layer** (`src/models/`): Data structures and business logic
- **Utils Layer** (`src/utils/`): Helper functions and utilities
- Keep UI logic separate from data processing logic

### 2. Modularity
- Each widget should be self-contained and reusable
- Use signals and slots (PyQt's event system) for communication between components
- Avoid tight coupling between modules

### 3. Performance Considerations
- Use lazy loading for protein structures (load only when selected)
- Implement caching for frequently accessed structures
- Use background threads (QThread) for heavy I/O operations
- Avoid blocking the main UI thread

### 4. Scalability
- Design to handle large datasets (1000+ protein structures)
- Use efficient data structures (e.g., dictionaries for lookups)
- Implement pagination or virtual scrolling if needed

## Coding Standards

### Python Style
- Follow PEP 8 style guide
- Use type hints for function signatures
- Maximum line length: 100 characters
- Use descriptive variable names (e.g., `protein_structure` not `ps`)

### Naming Conventions
- **Classes**: PascalCase (e.g., `ProteinViewer`, `FileListWidget`)
- **Functions/Methods**: snake_case (e.g., `load_protein_file`, `calculate_rmsd`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_VIEWER_WIDTH`, `SUPPORTED_FORMATS`)
- **Private methods**: prefix with underscore (e.g., `_update_internal_state`)

### Documentation
- Every module should have a docstring explaining its purpose
- Public functions/methods should have docstrings with:
  - Brief description
  - Args: parameter descriptions with types
  - Returns: return value description with type
  - Raises: exceptions that may be raised (if applicable)
- Use Google-style or NumPy-style docstrings consistently

Example:
```python
def load_protein_structure(file_path: str) -> biotite.structure.AtomArray:
    """Load a protein structure from a file.

    Args:
        file_path: Path to the protein structure file (PDB, mmCIF, etc.)

    Returns:
        Parsed protein structure as biotite AtomArray with vectorized access

    Raises:
        FileNotFoundError: If the file does not exist
        ValueError: If the file format is not supported
    """
```

### Error Handling
- Use specific exceptions rather than generic ones
- Always validate file paths and formats before processing
- Provide informative error messages to users via dialog boxes
- Log errors for debugging purposes
- Never silently fail - always inform the user

### File Format Support
**Initial support**:
- PDB (.pdb)
- mmCIF (.cif)

**Future support**:
- PDBx/mmCIF (.cif)
- MMTF (.mmtf)
- MOL2 (.mol2)

## UI/UX Guidelines

### Layout
- **Left Panel** (25-30% width): File browser and list
  - Folder selection button at top
  - Scrollable file list below
  - Show file name and optionally file size

- **Right Panel** (70-75% width): 3D protein viewer
  - Maximum space for structure visualization
  - Control buttons for view manipulation (rotate, zoom, reset)
  - Display protein name/ID at top

### User Interactions
- Single-click to select file from list
- Double-click or Enter key to load structure in viewer
- Right-click context menu for file operations
- Keyboard shortcuts for common operations:
  - Ctrl+O: Open folder
  - Ctrl+R: Refresh file list
  - Ctrl+Q: Quit application

### Visual Design
- Use a clean, professional color scheme
- Ensure adequate contrast for readability
- Support dark mode (future enhancement)
- Responsive layout that adapts to window resizing

## Development Workflow

### Package Management with uv
- **Install uv**: `curl -LsSf https://astral.sh/uv/install.sh | sh` or `pip install uv`
- **Create virtual environment**: `uv venv` (creates `.venv/`)
- **Activate environment**: `source .venv/bin/activate` (Linux/macOS) or `.venv\Scripts\activate` (Windows)
- **Install dependencies**: `uv sync` (installs from uv.lock for reproducibility)
- **Add dependency**: `uv add <package>` (e.g., `uv add pyqt6`)
- **Add dev dependency**: `uv add --dev <package>` (e.g., `uv add --dev pytest`)
- **Run scripts**: `uv run python src/main.py` or activate venv first
- **Update dependencies**: `uv lock --upgrade` to update lockfile

**Why uv?**
- 10-100x faster than pip for dependency resolution
- Built-in lockfile support for reproducible builds
- Single tool for venv + dependency management
- Drop-in replacement for pip/pip-tools
- Written in Rust, extremely performant

### Version Control
- Use meaningful commit messages (conventional commits format)
- Format: `type(scope): description`
  - Types: feat, fix, docs, style, refactor, test, chore
  - Example: `feat(viewer): add 3D protein rendering with py3Dmol`
- Commit frequently with logical units of work
- Never commit sensitive data or large binary files

### Testing
- Write unit tests for all utility functions
- Write integration tests for UI components when possible
- Test with various protein file formats and sizes
- Run tests before committing: `pytest tests/`

### Dependencies
- Keep dependencies minimal and well-justified
- Pin dependency versions in pyproject.toml (managed by uv)
- Document why each major dependency is needed
- Use `uv add <package>` to add new dependencies
- Use `uv sync` to install dependencies from lockfile

## Feature Roadmap

### Phase 1: Basic Viewer (Current)
- [x] Project setup and structure
- [ ] Main window with split layout
- [ ] Folder selection and file listing
- [ ] Basic 3D protein visualization
- [ ] File selection to viewer connection

### Phase 2: Enhanced Viewing
- [ ] Multiple visualization styles (cartoon, surface, stick)
- [ ] Color schemes (by chain, by secondary structure, by B-factor)
- [ ] Zoom, rotate, pan controls
- [ ] Screenshot/export functionality

### Phase 3: Metrics and Filtering
- [ ] Display metrics panel (e.g., RMSD, energy scores)
- [ ] Load metrics from CSV or JSON files
- [ ] Filter proteins by metrics
- [ ] Sort by columns

### Phase 4: Calculations
- [ ] RMSD calculation between structures
- [ ] Sequence alignment display
- [ ] Distance measurements
- [ ] Hydrogen bond detection

### Phase 5: Advanced Features
- [ ] Multiple structure comparison (superposition)
- [ ] Custom scripting for batch operations
- [ ] Export filtered results
- [ ] Session save/load

## Common Patterns

### Loading Structures with biotite
biotite provides a vectorized API for fast structure analysis:
```python
import biotite.structure.io as strucio

# Load PDB file
atom_array = strucio.load_structure(file_path)

# Vectorized operations - much faster than BioPython!
# Get all CA atoms
ca_atoms = atom_array[atom_array.atom_name == "CA"]

# Get coordinates as NumPy array
coords = atom_array.coord  # Shape: (n_atoms, 3)

# Filter by chain
chain_a = atom_array[atom_array.chain_id == "A"]

# Calculate center of mass
import numpy as np
center = np.mean(atom_array.coord, axis=0)

# Get residue IDs, names, etc. as arrays
res_ids = atom_array.res_id
res_names = atom_array.res_name
```

**Why biotite over BioPython?**
- All data stored in NumPy arrays → vectorized operations
- 10-100x faster for batch operations
- Cleaner API with intuitive array indexing
- Better for computational analysis and filtering

### Loading Files Asynchronously
Use QThread to avoid blocking the UI:
```python
class LoadProteinThread(QThread):
    finished = pyqtSignal(object)  # Emits the loaded structure

    def __init__(self, file_path):
        super().__init__()
        self.file_path = file_path

    def run(self):
        structure = load_protein_structure(self.file_path)
        self.finished.emit(structure)
```

### Error Dialogs
Use QMessageBox for user-friendly error messages:
```python
from PyQt6.QtWidgets import QMessageBox

def show_error(parent, title, message):
    QMessageBox.critical(parent, title, message)
```

## Security Considerations

- Validate all file paths to prevent directory traversal
- Sanitize file names before display
- Limit file sizes to prevent memory exhaustion (warn for files > 100MB)
- Don't execute arbitrary code from structure files

## Performance Targets

- Application startup: < 2 seconds
- Load and display structure (< 1000 residues): < 1 second
- Load and display structure (1000-5000 residues): < 3 seconds
- File list refresh (1000 files): < 2 seconds
- UI responsiveness: Never block for > 100ms

## Accessibility

- Ensure keyboard navigation works throughout the app
- Provide tooltips for all buttons and controls
- Use adequate font sizes (minimum 10pt)
- Support high DPI displays

## Known Limitations

- Very large structures (> 10,000 residues) may have performance issues
- Initial version supports local files only (no remote PDB fetching)
- No undo/redo functionality in initial version

## Getting Help

- biotite documentation: https://www.biotite-python.org/
- uv documentation: https://docs.astral.sh/uv/
- PyQt6 documentation: https://doc.qt.io/qtforpython-6/
- py3Dmol documentation: https://3dmol.csb.pitt.edu/
- PDB file format: https://www.wwpdb.org/documentation/file-format

## Contributing Guidelines

When working on this project:
1. Read and understand the existing code before making changes
2. Follow the established patterns and conventions
3. Write tests for new functionality
4. Update documentation when adding features
5. Keep changes focused and atomic
6. Ensure code works on Windows, macOS, and Linux

## Notes for Claude

- **Prefer editing over creating**: Always modify existing files rather than creating new ones unless a new module is genuinely needed
- **Test before committing**: Verify that code runs without errors
- **Read first**: Always read files before suggesting modifications
- **Simple solutions**: Avoid over-engineering; implement what's needed, not what might be needed
- **User feedback**: The UI should always provide feedback for user actions (loading indicators, success/error messages)
- **Cross-platform**: Ensure code works on Windows, macOS, and Linux
- **Python-first**: Use Python libraries and patterns; this is a Python project
