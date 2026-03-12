# Migration Roadmap: Phased Implementation Plan

## Overview

This document defines the phased migration from the Python/PyQt6 application (~11,400 lines) to a React + Mol* + Electron web stack. Each phase is designed to produce a testable, functional milestone.

**Estimated total effort: 6 phases**

---

## Phase 1: Project Scaffolding & Mol* Viewer

**Goal:** Electron app that loads and renders a single PDB/mmCIF file with Mol*.

### Tasks

1. **Initialize project**
   - Vite + React + TypeScript scaffold
   - electron-vite configuration
   - Tailwind CSS + shadcn/ui setup (`components.json`, base components)
   - ESLint, Prettier, Vitest configuration

2. **Electron main process**
   - `electron/main.ts` — window creation, dev/prod modes
   - `electron/preload.ts` — contextBridge with IPC API:
     - `openFolder()` → native folder dialog
     - `readFile(path)` → file contents as string
     - `listFiles(dir, extensions)` → file list
   - `electron/ipc-handlers.ts` — fs handlers with validation

3. **Mol* viewer component**
   - `useMolstar` hook — plugin lifecycle (create, dispose)
   - `MolstarViewer.tsx` — container with Mol* plugin instance
   - Load a structure from file path (via Electron IPC → file contents → Mol* `data.download`)
   - Basic representation: cartoon with spectrum coloring
   - Verify WebGL rendering on Windows, macOS, Linux

4. **Minimal file browser**
   - Open folder dialog → scan for `.pdb` / `.cif` files
   - Simple list display
   - Click file → load in Mol* viewer

### Dependencies
- None (greenfield)

### Acceptance Criteria
- [ ] `npm run dev` starts Electron with hot reload
- [ ] Open folder → see list of PDB files
- [ ] Click file → 3D structure renders in Mol*
- [ ] `npm run build` produces installable binary

---

## Phase 2: Viewer Features & Selection

**Goal:** Full viewer feature parity with current py3Dmol implementation.

### Tasks

1. **Representation styles**
   - Cartoon, stick, sphere, line, surface — mapped to Mol* representation types
   - Style selector dropdown (shadcn `Select`)

2. **Color schemes** (6 built-in + custom)
   - Spectrum (N→C terminus) — Mol* built-in `sequence-id`
   - Chain — Mol* built-in `chain-id` with custom palette
   - Secondary structure — Mol* `secondary-structure-type` with custom colors
   - B-factor — Mol* `uncertainty` or custom coloring from B-factor column
   - Hydrophobicity — custom Mol* `ColorTheme` using Kyte-Doolittle scale
   - Metric — custom `ColorTheme` mapping per-residue values to gradient
   - Color legend widget

3. **Residue selection**
   - Click selection via Mol* `Interactivity` behavior
   - Multi-select (Ctrl+Click)
   - Hover highlighting
   - Selection state: `Set<"chainId:resId">` in Zustand store
   - Select All / None / Invert / by Range / by Chain
   - Selection color customization
   - Zoom to selection

4. **Sequence viewer**
   - Mol* built-in sequence viewer (`mol-plugin-ui` SequenceView)
   - Bidirectional sync with 3D selection
   - Chain separators

5. **Background color**
   - Theme-aware (white/dark)

### Dependencies
- Phase 1 complete

### Key Mappings (py3Dmol → Mol*)

| py3Dmol | Mol* Equivalent |
|---------|----------------|
| `viewer.addModel(data, format)` | `plugin.builders.data` + `structure.parseTrajectory` |
| `viewer.setStyle({}, spec)` | `plugin.builders.structure.representation` |
| `viewer.setClickable(...)` | `plugin.behaviors.interaction.click` |
| `viewer.setHoverable(...)` | `plugin.behaviors.interaction.hover` |
| `viewer.zoomTo()` | `plugin.canvas3d.requestCameraReset()` |
| `{colorscheme: 'spectrum'}` | `ColorTheme` with `sequence-id` |
| `{colorscheme: {prop: 'b', gradient: 'rwb'}}` | Custom `ColorTheme` on B-factor |

### Acceptance Criteria
- [ ] All 5 representation styles render correctly
- [ ] All 6 color schemes apply correctly
- [ ] Click/Ctrl+Click selects residues in 3D
- [ ] Sequence viewer syncs with 3D selection bidirectionally
- [ ] Selection operations (all, none, invert, range, chain) work

---

## Phase 3: File Management & Grouping

**Goal:** Full file browser with hierarchical target/binder grouping.

### Tasks

1. **File browser tree view**
   - shadcn `Tree` or custom recursive list
   - Show filename + file size
   - Single-click to select, loading on select
   - Ctrl+R refresh, Ctrl+O open folder

2. **Sequence hashing** (port from `grouping.py`)
   - Hash chain sequences for grouping
   - Web Worker for batch hashing
   - IndexedDB cache (replaces `.seqhash.json` sidecar files)
   - Cache invalidation via file modification time

3. **Hierarchical grouping**
   - Level 1: Target groups (shared target sequence)
   - Level 2: Binder sub-groups (identical binder sequences)
   - Tree view with expandable group headers
   - Group counts in headers

4. **Target/binder auto-detection**
   - Port heuristic: chains in >50% of structures = target
   - Manual override dialog (shadcn `Dialog`)

5. **Custom groups**
   - Create named groups from search results or manual selection
   - UUID-based group IDs

6. **Zustand stores**
   - `file-store.ts` — file list, current folder, active file
   - `protein-store.ts` — loaded proteins (lazy), protein cache

### Dependencies
- Phase 1 (file loading), Phase 2 (viewer integration)

### Porting Notes
- `grouping.py` is 1,130 lines — largest algorithmic module
- KD-tree usage for binder contact search is in Phase 5
- Sequence hashing is straightforward string → MD5
- **All algorithm pseudocode is in `07-reference-data.md` §4** (interface detection, RASA, grouping, auto-detect, binder search, alignment)

### Acceptance Criteria
- [ ] Open folder shows grouped file tree
- [ ] Groups update when new files are added
- [ ] Auto-detection correctly identifies target/binder chains
- [ ] Custom groups can be created and persisted

---

## Phase 4: Metrics System & Table

**Goal:** Metrics calculation, import/export, and interactive table.

### Tasks

1. **Metrics calculation** (port from `metrics.py`)
   - RASA: Port SASA algorithm or use approximation in Web Worker
     - MAX_ASA lookup table (Tien et al. 2013 values)
     - Normalize SASA → RASA per residue
   - pLDDT: Extract from B-factor column (Mol* parsed structure data)
   - B-factor: Average per residue from all atoms

2. **Batch calculation**
   - Web Worker for non-blocking computation
   - Progress reporting via `postMessage`
   - Process all proteins in folder

3. **Metrics import/export** (format specs in `07-reference-data.md` §5)
   - CSV import: first column = protein name, rest = metric values
   - JSON import: per-structure metrics, AlphaFold PAE format support (3 format variants)
   - CSV/JSON export
   - Auto-match JSON files to PDB files by stem name
   - Single-protein JSON auto-scanning with recursive numeric extraction

4. **Metrics table** (TanStack Table + shadcn)
   - Columns: protein name + one per metric
   - Sortable headers (ascending/descending)
   - Text search filter (protein name)
   - Range filters per metric column (min/max sliders)
   - Real-time filtering
   - Filter status count
   - Double-click row → load in viewer
   - Column visibility toggle
   - Virtualized rows for large datasets

5. **Zustand store**
   - `metrics-store.ts` — metrics data, filter state, filter ranges

6. **Filter persistence**
   - Save/load filter ranges to localStorage (replaces `~/.config/designcampaign/filters.json`)

### Dependencies
- Phase 1 (file loading), Phase 3 (file management for batch operations)

### Porting Notes
- SASA calculation is the most complex algorithm to port
  - Current implementation uses `biotite.sasa()` — a C-extension
  - Options: (a) port Shrake-Rupley algorithm to TypeScript, (b) use WASM compiled from C, (c) use simpler approximation
  - Recommend option (a) for initial implementation — Shrake-Rupley is ~200 lines
  - **Full Shrake-Rupley pseudocode and VDW radii in `07-reference-data.md` §4.2**
- pLDDT and B-factor extraction are straightforward from Mol* parsed data

### Acceptance Criteria
- [ ] RASA, pLDDT, B-factor calculated correctly for test structures
- [ ] CSV/JSON import populates metrics table
- [ ] Table sorts and filters in real-time
- [ ] Filter ranges persist across sessions
- [ ] Batch calculation completes without blocking UI

---

## Phase 5: Scatter Plot, Interface Analysis & Selection Panel

**Goal:** Interactive plotting, binder contact search, and complete selection panel.

### Tasks

1. **Scatter plot** (Plotly.js)
   - X/Y axis selectable from available metrics
   - Each point = one protein
   - Click point → load protein in viewer
   - Hover tooltip with protein name + values
   - Filter lines overlaid on plot
   - Theme-aware colors

2. **Interface detection** (port from `interface.py`)
   - KD-tree spatial proximity queries (use `kd-tree-javascript` or similar npm package)
   - Distance cutoff: configurable, default 4.0 Å
   - Bidirectional interface residue identification
   - Contact counting per residue
   - Web Worker for computation

3. **Binder contact search** (port from `grouping.py` lines 643-766)
   - Target residue input
   - Match modes: Any, All, Count, Percentage
   - Results list sortable by contact count
   - Double-click result → load structure
   - Create custom group from results

4. **Selection panel assembly**
   - Collapsible sections (shadcn `Collapsible`):
     - Style & Color controls
     - Residue selection tools
     - Interface search
   - Export: FASTA and CSV for selected residues
   - Selection color picker

5. **Zustand store**
   - `selection-store.ts` — selected residues, color scheme, viewer style, selection color

### Dependencies
- Phase 2 (selection), Phase 3 (grouping for custom groups), Phase 4 (metrics for plot)

### Porting Notes
- KD-tree: `grouping.py` uses `scipy.spatial.cKDTree` — need JS equivalent
  - `kd-tree-javascript` npm package provides `KDTree` class with `nearest()` and range queries
  - Alternative: `rbush` for 2D, but we need 3D
- Binder contact search is the most complex query — involves iterating all structures
- **Full algorithm pseudocode for interface detection and binder search in `07-reference-data.md` §4.1 and §4.7**
- **Match mode logic in `07-reference-data.md` §4.7**

### Acceptance Criteria
- [ ] Scatter plot renders with correct data points
- [ ] Click plot point loads structure
- [ ] Interface detection matches Python implementation results
- [ ] Binder contact search returns correct results for all match modes
- [ ] Selection panel sections collapse/expand

---

## Phase 6: Comparison, Theme, Polish & Packaging

**Goal:** Feature-complete application ready for distribution.

### Tasks

1. **Structure comparison** (port from `alignment.py`)
   - CA-atom superposition — Mol* has built-in `StructureSuperposition`
   - RMSD calculation
   - Multi-structure overlay (up to 4 structures)
   - Toggle individual comparison structures on/off
   - File dialog for adding comparison structures

2. **Theme system**
   - Light/dark mode toggle
   - Tailwind `dark:` classes throughout
   - Mol* theme customization CSS overrides
   - Persisted in localStorage

3. **User configuration migration**
   - Port `UserConfig` to localStorage/IndexedDB
   - Settings: filter ranges, viewer preferences, last folder, window geometry
   - Import existing `~/.config/designcampaign/config.json` (one-time migration)

4. **Keyboard shortcuts**
   - Ctrl+O: Open folder
   - Ctrl+R: Refresh
   - Other shortcuts as needed

5. **Error handling & UX polish**
   - Error dialogs for parse failures
   - Loading indicators for structure loading
   - Progress bars for batch operations
   - Status bar with action feedback
   - File size warnings (>100MB)

6. **Electron packaging**
   - `electron-builder` configuration
   - Windows (NSIS installer), macOS (DMG), Linux (AppImage)
   - Auto-update support
   - Application icon and metadata

7. **Testing**
   - Vitest unit tests for:
     - Metrics calculations (RASA, pLDDT, B-factor)
     - Interface detection
     - Sequence hashing and grouping
     - File utilities
   - Playwright E2E tests for:
     - Open folder → load structure → viewer renders
     - Selection flow (click, range, chain)
     - Metrics import → table → filter → plot

### Dependencies
- All previous phases

### Acceptance Criteria
- [ ] Structure alignment produces correct RMSD values
- [ ] Light/dark theme switches cleanly
- [ ] Packaged binary installs and runs on Windows, macOS, Linux
- [ ] All unit tests pass
- [ ] E2E tests cover critical workflows

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SASA algorithm accuracy | Medium | High | Validate against biotite output for test structures |
| Mol* API breaking changes | Low | High | Pin Mol* version; wrap in abstraction layer |
| KD-tree JS performance | Medium | Medium | Benchmark against scipy; use Web Workers; consider WASM fallback |
| Electron binary size | Certain | Low | Accept ~100MB; optimize with code splitting |
| Mol* custom ColorTheme complexity | Medium | Medium | Start with built-in themes; add custom ones incrementally |
| Large dataset performance (1000+ proteins) | Medium | High | Virtualized table, lazy loading, Web Workers from start |

---

## Phase Dependencies Graph

```
Phase 1 (Scaffold + Mol*)
    ├── Phase 2 (Viewer Features)
    │       └── Phase 5 (Plot + Interface + Selection)
    ├── Phase 3 (Files + Grouping)
    │       └── Phase 5
    └── Phase 4 (Metrics + Table)
            └── Phase 5
                    └── Phase 6 (Comparison + Polish + Packaging)
```

Phases 2, 3, and 4 can proceed in parallel after Phase 1. Phase 5 requires all three. Phase 6 is the final integration phase.
