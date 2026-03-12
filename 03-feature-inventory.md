# Feature Inventory: Complete Catalog of Current Application

This document catalogs every feature in the current Python/PyQt6 DesignCampaign application. Each feature is described with its current behavior, user-facing interaction, and implementation notes relevant for the web migration.

---

## 1. Application Shell & Layout

### 1.1 Main Window
- **Window**: 1200x800 default, resizable
- **Layout**: Horizontal splitter — left panel (25%) | right panel (75%)
- **Left panel**: File browser with hierarchical grouping (tree view)
- **Right panel**: Tabbed interface with 5 tabs:
  1. Viewer (3D visualization + sequence viewer)
  2. Metrics (sortable/filterable table)
  3. Plot (scatter plot)
  4. Selection (residue controls, coloring, interface search)
  5. Comparison (multi-structure alignment)
- **Menu bar**: File, View, Tools menus with keyboard shortcuts
- **Status bar**: Progress indicators, action feedback

### 1.2 Theme System
- Light and dark mode toggle
- Theme affects all components: background, foreground, borders, plot colors, table styling, viewer background
- Singleton ThemeManager with listener callbacks for live switching
- Persisted in user configuration

### 1.3 User Configuration Persistence
- Stored at `~/.config/designcampaign/filters.json`
- Saves: metric filter ranges, viewer settings
- JSON-based serialization

---

## 2. File Management

### 2.1 Folder Browsing
- **Open Folder**: Dialog to select a directory containing protein structure files
- **Recursive scan**: Finds all `.pdb` and `.cif` files in the selected folder
- **File display**: Shows filename + file size in tree view
- **Refresh**: Re-scans current folder for new/changed files
- **File size warning**: Alert if file exceeds 100MB
- **Keyboard shortcuts**: Ctrl+O (open folder), Ctrl+R (refresh)

### 2.2 Structure Loading
- **Lazy loading**: Proteins are only parsed when selected (not on folder open)
- **Format detection**: Automatic PDB vs mmCIF detection from extension
- **Biotite parsing**: Uses `PDBFile` or `CIFFile` for structure parsing
- **Error handling**: User-friendly dialogs on parse failure
- **Background threading**: QThread workers prevent UI blocking during load

### 2.3 Hierarchical Grouping
- **2-level hierarchy**:
  - **Level 1 — Target groups**: Structures sharing the same target chain sequence
  - **Level 2 — Binder sub-groups**: Within a target group, structures with identical binder sequences
- **Sequence hashing**: MD5 hash of chain sequences for fast comparison
- **Caching**: `.seqhash.json` sidecar files for disk-level caching of sequence hashes
  - Memory + disk cache with modification time validation
  - Cache version tracking for invalidation
- **Custom groups**: User-created groups from search results or manual selection
- **Auto-detection**: Heuristic for detecting target vs binder chains based on sequence frequency across structures (chains appearing in >50% of structures = target)
- **Background grouping**: SequenceGroupWorker runs grouping off the UI thread

---

## 3. 3D Protein Visualization

### 3.1 Viewer Core
- **Rendering engine**: py3Dmol (3Dmol.js) embedded in QWebEngineView
- **WebGL**: Hardware-accelerated 3D rendering
- **JavaScript bridge**: QWebChannel for bidirectional Python↔JS communication
- **Controls**: Mouse-based rotation, zoom, pan (3Dmol.js built-in)

### 3.2 Visualization Styles
Five representation styles, user-selectable:
1. **Cartoon** — Secondary structure ribbons (default)
2. **Stick** — Ball-and-stick atom representation
3. **Sphere** — Space-filling van der Waals spheres
4. **Line** — Thin wireframe connections
5. **Surface** — Molecular surface

### 3.3 Color Schemes
Six built-in color schemes:

| Scheme | Description | Implementation |
|--------|-------------|----------------|
| **Spectrum** | Rainbow N→C terminus | Blue → Green → Red gradient |
| **Chain** | Different color per chain | 10 rotating colors: blue, orange, green, red, purple, brown, pink, gray, olive, cyan |
| **Secondary Structure** | Helix/Sheet/Coil | ssJmol: helix=#ff0080, sheet=#ffc800, coil=#ffffff |
| **B-Factor** | Temperature factor gradient | Red-White-Blue, 0→100 scale |
| **Hydrophobicity** | Kyte-Doolittle scale | Blue (hydrophilic, -4.5) → Red (hydrophobic, +4.5) via custom JS colorfunc |
| **Metric** | Arbitrary per-residue values | Configurable colormap (rwb, bwr, viridis), custom min/max |

Additional:
- **Custom scheme**: Per-residue color assignment via color picker
- **Color legend widget**: Dynamic legend display showing current scheme colors

### 3.4 Residue Selection
- **Click selection**: Click residue in 3D viewer to select
- **Multi-select**: Ctrl/Cmd+Click for additive selection
- **Hover effects**: Visual feedback on mouseover
- **Selection operations**:
  - Select All
  - Select None (clear)
  - Invert Selection
  - Select by Range (e.g., "1-50", "A:10-A:30")
  - Select by Chain
- **Selection state**: Stored as `Set[(chain_id, residue_id)]` tuples (chain-aware)
- **Selection color**: Customizable via color picker
- **Zoom to selection**: Camera focuses on selected residues

### 3.5 Background Color
- Matches theme (white for light, #1e1e1e for dark)
- Deferred initialization (waits for page load before setting)

---

## 4. Sequence Viewer

### 4.1 Display
- **Position**: Horizontal bar above the 3D viewer
- **Content**: One cell per residue showing single-letter amino acid code
- **Chain separators**: Visual dividers between chains
- **Cell sizing**: Small, medium, or large cell size options
- **Scrollable**: Horizontal scroll for long sequences

### 4.2 Interaction
- **Click**: Select/deselect individual residues
- **Ctrl+Click**: Multi-select
- **Bidirectional sync**: Selecting in sequence viewer highlights in 3D viewer and vice versa

### 4.3 Coloring
- **Interface residues**: Orange border/highlight
- **Selected residues**: Yellow highlight
- **Metric-based**: Color each cell by current metric value
- **Theme-aware**: Adapts to light/dark mode

---

## 5. Metrics System

### 5.1 Built-in Metrics

| Metric | Description | Range | Source |
|--------|-------------|-------|--------|
| **RASA** | Relative Accessible Surface Area | 0.0 – 1.0 | Calculated via biotite SASA, normalized by Tien et al. (2013) max ASA values |
| **pLDDT** | AlphaFold confidence score | 0 – 100 | Extracted from B-factor column of AlphaFold PDB files |
| **B-factor** | Temperature/displacement factor | Variable | Averaged per-residue from all atoms in residue |

### 5.2 Custom Metrics
- **CSV import**: First column = protein name, additional columns = metric values
- **JSON import**: Object or array format, supports complex nested structures (e.g., AlphaFold PAE scores)
  - List-of-dicts format with chain pair labels
  - pdockq/pdockq2 metric extraction
  - Aggregate computation
- **Export**: CSV or JSON format

### 5.3 Batch Calculation
- Calculate RASA/pLDDT/B-factor for all proteins in a folder
- Background thread processing with progress reporting
- Non-blocking UI during computation

### 5.4 Metrics Store
- In-memory storage of per-protein metrics
- `ProteinMetrics` dataclass per protein
- Metric registration with min/max tracking
- JSON serialization with numpy type conversion (int64→int, float64→float)

---

## 6. Metrics Table

### 6.1 Display
- Sortable table with columns: Protein Name + one column per metric
- Alternating row colors for readability
- Header with column names

### 6.2 Sorting
- Click column header to sort ascending/descending
- Multi-column sort support via QSortFilterProxyModel

### 6.3 Filtering
- **Text search**: Filter by protein name (case-insensitive substring match)
- **Range filters**: Min/max sliders/inputs per metric column
- **Real-time**: Filters apply immediately as user types/adjusts
- **Filter status**: Shows count of visible vs total proteins
- **Persistence**: Filter ranges saved to user config

### 6.4 Interaction
- Double-click row to load that protein in the 3D viewer
- Selection syncs with file list

### 6.5 Column Management
- Toggle column visibility
- Metrics popout (separate window)

---

## 7. Interactive Plotting

### 7.1 Scatter Plot
- X-axis and Y-axis selectable from available metrics
- Each point = one protein
- Backend: pyqtgraph for performance

### 7.2 Interaction
- Click point to select/load that protein
- Hover for tooltip with protein name + values
- Dynamic axis labels and data ranges

### 7.3 Filtering Integration
- Filter lines shown on plot corresponding to current metric filters
- Theme-aware colors

---

## 8. Selection Panel

### 8.1 Visualization Controls
- Style selector dropdown (cartoon/stick/sphere/line/surface)
- Color scheme selector with live preview
- Combined color scheme + legend in single panel

### 8.2 Residue Selection Tools
- Select All / None / Invert buttons
- Range selection input field
- Chain selection dropdown
- Selection color picker

### 8.3 Export
- Export selected residues as FASTA format
- Export selected residues as CSV

### 8.4 Interface Search (Binder Contact Analysis)
- **Target residue input**: Specify target residues to search for contacts
- **Distance cutoff**: Configurable (default 4.0 Å)
- **Search**: Find binder residues contacting specified target residues across all loaded structures
- **Match modes**:
  - Any: Binder contacts any specified target residue
  - All: Binder contacts all specified target residues
  - Count: Binder contacts at least N specified target residues
  - Percentage: Binder contacts at least N% of specified target residues
- **Results list**: Sortable by contact count, double-click to load structure
- **Create Group**: Export search results as a named custom group
- **Auto-infer chains**: Target/binder chain designation inferred from query

### 8.5 Target/Binder Designation
- Dialog to designate which chains are target vs binder
- Manual per-structure assignment
- Auto-detection across multiple structures (frequency heuristic)

### 8.6 Collapsible Sections
- UI organized into collapsible groups for space efficiency
- Sections: Style & Color, Selection, Interface Search, etc.

---

## 9. Structure Comparison & Alignment

### 9.1 Alignment
- CA-atom (alpha carbon) based structural superposition
- RMSD calculation on the alignment chain
- Uses biotite's superposition algorithm

### 9.2 Multi-Structure Overlay
- Load multiple structures simultaneously in the viewer
- Comparison structures displayed as overlays
- Toggle individual comparison structures on/off
- File dialog for selecting comparison structures

---

## 10. Interface Analysis

### 10.1 Interface Detection
- **Algorithm**: KD-tree (scipy cKDTree) for O(n log n) spatial proximity queries
- **Distance cutoff**: Configurable, default 4.0 Å
- **Bidirectional**: Identifies interface residues on both chains
- **All-chain**: Can compute interfaces for all chain pairs

### 10.2 Contact Counting
- Count atomic contacts per interface residue
- Results used for ranking and filtering

### 10.3 Residue Mapping
- Three-letter to one-letter amino acid conversion
- Handles non-standard residues (MSE→M, SEC→U, PYL→O)

---

## 11. Data Constants & Reference Tables

All constants, lookup tables, color values, and application defaults are fully specified with
TypeScript-ready code in **`07-reference-data.md`** (Sections 1–3, 7). Key items:

- **Amino Acid Properties**: MAX_ASA (Tien et al. 2013), Kyte-Doolittle hydrophobicity, three-to-one codes (20 standard + 3 non-standard)
- **Color Constants**: 10 chain colors, ssJmol secondary structure colors, pLDDT thresholds, full light/dark theme palettes
- **Color Gradient Functions**: RWB, BWR, viridis implementations with TypeScript code
- **Application Defaults**: window size, panel ratios, file size limits, supported formats

---

## 12. Cross-Cutting Concerns

### 12.1 Error Handling
- User-friendly error dialogs for file parse failures
- Graceful fallbacks for missing data (empty metrics, no B-factors, etc.)
- Logging at DEBUG/WARNING levels

### 12.2 Performance Patterns
- Lazy loading of structures
- Background threading for I/O and computation
- Vectorized numpy operations for metrics
- KD-tree spatial indexing
- Sequence hash caching (memory + disk)
- Progress reporting for batch operations

### 12.3 WSL2/Linux Compatibility
- Software WebGL rendering (SwiftShader) for WSL2
- XCB platform preference over Wayland (avoids 1px buffer crash)
- GPU acceleration disabled for compatibility

---

## Feature Summary Table

| # | Feature | Priority | Mol* Handles? |
|---|---------|----------|---------------|
| 1 | 3D viewer with cartoon/stick/sphere/line/surface | Critical | Yes — built-in |
| 2 | 6 color schemes (spectrum, chain, SS, B-factor, hydro, metric) | Critical | Yes — built-in + custom |
| 3 | Residue selection (click, multi, range, chain) | Critical | Yes — built-in |
| 4 | Sequence viewer with sync | Critical | Yes — built-in |
| 5 | File browser with folder scan | Critical | Custom (React) |
| 6 | Hierarchical grouping (target/binder) | High | Custom (React) |
| 7 | Metrics table with sort/filter | High | Custom (TanStack Table) |
| 8 | Interface detection (KD-tree) | High | Custom (TypeScript) |
| 9 | Scatter plot | High | Custom (Plotly.js) |
| 10 | CSV/JSON metrics import/export | High | Custom (TypeScript) |
| 11 | Batch metric calculation | Medium | Custom (Web Workers) |
| 12 | Structure alignment/comparison | Medium | Mol* has superposition |
| 13 | Binder contact search with match modes | Medium | Custom (TypeScript) |
| 14 | Theme system (light/dark) | Medium | Tailwind dark mode |
| 15 | FASTA/CSV export of selections | Low | Custom (TypeScript) |
| 16 | User config persistence | Low | localStorage/IndexedDB |
| 17 | Custom groups | Low | Custom (React state) |
| 18 | Auto-detect target/binder chains | Low | Custom (TypeScript) |
