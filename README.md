# DesignCampaign

A desktop application for viewing and analysing protein structure design campaigns. Load a folder of PDB/CIF files, extract or import metrics, filter and rank designs, visualise structures in 3D, and detect binding interfaces — all in one place.

[![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white)](https://github.com/lhmartin/DesignCampaign/releases)
[![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white)](https://github.com/lhmartin/DesignCampaign/releases)
[![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black)](https://github.com/lhmartin/DesignCampaign/releases)
[![CI](https://github.com/lhmartin/DesignCampaign/actions/workflows/ci.yml/badge.svg)](https://github.com/lhmartin/DesignCampaign/actions/workflows/ci.yml)

<!-- screenshot: main window — 3D viewer (right) + metrics table (left) with a folder of nanobody structures loaded -->

---

## Contents

- [Quick Start](#quick-start)
- [Download & Install](#download--install)
- [Features](#features)
  - [File Browser](#file-browser)
  - [3D Viewer](#3d-viewer)
  - [Sequence Viewer](#sequence-viewer)
  - [Metrics Table](#metrics-table)
  - [Filtering & Ranking](#filtering--ranking)
  - [Scatter Plot](#scatter-plot)
  - [Interface Analysis](#interface-analysis)
  - [Sequence Alignment](#sequence-alignment)
  - [Selection Panel](#selection-panel)
  - [Structure Comparison](#structure-comparison)
  - [RMSD Analysis](#rmsd-analysis)
  - [CDR Annotation (AntPack)](#cdr-annotation-antpack)
  - [Epitope Search](#epitope-search)
  - [UniProt & BLAST Search](#uniprot--blast-search)
  - [Claude AI Chat](#claude-ai-chat)
  - [Marimo Notebook](#marimo-notebook)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Example Data](#example-data)
- [Limitations](#limitations)
- [Roadmap](#roadmap)
- [Development](#development)

---

## Quick Start

1. **Open a folder** — click **Open Folder** (or `Ctrl/Cmd+O`) and select a directory of `.pdb` or `.cif` files. Subdirectories are scanned automatically.
2. **Load metrics** — click **Calculate All** in the Files tab to extract built-in metrics, or **Import CSV/JSON** to load pre-computed scores. Adjacent `.json` sidecar files are merged automatically.
3. **Filter and rank** — open the **Filter** tab, add numeric rules (`ddg < -40`), choose a ranking method (Borda count or weighted sum), and a `rank_score` column appears in the table.
4. **Visualise** — double-click any row in the **Metrics** table to load that structure in the 3D viewer.
5. **Detect interfaces** — click the **Interface** button in the viewer toolbar, set binder and target chains, and click **Calculate** to identify paratope and epitope residues.

---

## Download & Install

Pre-built installers are on the [Releases page](https://github.com/lhmartin/DesignCampaign/releases).

| Platform | File |
|----------|------|
| Windows (installer) | `DesignCampaign-Windows-Setup-*.exe` |
| Windows (portable)  | `DesignCampaign-Windows-Portable-*.exe` |
| macOS               | `DesignCampaign-macOS-*.dmg` |
| Linux               | `DesignCampaign-Linux-*.AppImage` or `*.deb` |

### First-run security warnings

The app is not code-signed.

**macOS** — Right-click the `.app` inside the DMG → **Open** → **"Open Anyway"**. If you already dismissed the warning, go to **System Settings → Privacy & Security** and click **"Open Anyway"**.

**Windows** — Click **"More info"** in the SmartScreen dialog → **"Run anyway"**.

---

## Features

### File Browser

<!-- screenshot: file browser with a folder tree open and several PDB files listed -->

**Opening files**

- `Ctrl/Cmd+O` or the **Open Folder** button to pick a directory. All `.pdb`, `.cif`, and `.mmcif` files are found recursively.
- Single-click a file to load it in the 3D viewer.
- `Ctrl/Cmd`-click to load it as a **comparison overlay** (up to 6 structures simultaneously).
- `Ctrl/Cmd+R` to refresh after adding or removing files.

**Two view modes** (toggle in the toolbar):

- **Tree** — classic directory hierarchy.
- **Groups** — structures automatically clustered by shared target-chain sequence, then by binder-chain identity within each cluster. Useful for comparing many variants against the same target.

**Search** — the search bar filters by filename in real time. The file count and a "N of M matches" counter update as you type.

**Sidecar JSON files** — if a `.json` file shares the same stem as a `.pdb` (e.g. `design_001.json` next to `design_001.pdb`), its contents are automatically parsed and merged as metric columns. No import step needed.

**Built-in metric calculation** — click **Calculate All** to extract `mean_plddt`, `mean_bfactor`, `num_residues`, and `chain_count` directly from the coordinates of every file.

---

### 3D Viewer

<!-- screenshot: 3D viewer showing a nanobody–antigen complex with interface residues coloured -->

Powered by [Mol*](https://molstar.org/) — the same engine used by RCSB PDB and AlphaFold DB.

**Representations** (toolbar dropdown):

| Style | Best for |
|-------|----------|
| Cartoon | Secondary structure overview (default) |
| Ball-and-stick | Residue-level detail |
| Spacefill | Volume / packing |
| Gaussian Surface | Molecular surface |
| Putty | B-factor / uncertainty (tube thickness = value) |
| Wireframe | Lightweight skeleton |
| Backbone | Cα trace |
| Molecular Surface | Solvent-accessible surface |

**Colour schemes** (toolbar dropdown):

| Scheme | Description |
|--------|-------------|
| Spectrum (N→C) | Rainbow from N-terminus (blue) to C-terminus (red) |
| Chain ID | Distinct colour per chain |
| Secondary Structure | Helix pink, sheet yellow, coil white |
| pLDDT / B-Factor | Blue (low) → white → red (high) |
| Hydrophobicity | Kyte-Doolittle scale |
| Element | CPK (C grey, N blue, O red, S yellow…) |
| RMSD Deviation | Per-residue Cα deviation from a reference |
| Interface | Paratope / epitope contact colouring |

**Mouse controls**: left-drag to rotate, right-drag or `Ctrl`-drag to pan, scroll to zoom, double-click to focus.

---

### Sequence Viewer

<!-- screenshot: sequence viewer strip showing CDR regions highlighted above the 3D viewer -->

A scrollable residue strip below the toolbar. Click any cell to select that residue; `Ctrl`-click to add to the selection. Selection syncs bidirectionally with the 3D viewer.

**Colouring modes**: None, Chemical Property, Hydrophobicity, pLDDT, RMSD Deviation.

**Annotations rendered above the strip**:
- Interface residues (paratope/epitope contacts)
- CDR1/CDR2/CDR3 and FW1–FW4 region brackets (if AntPack annotation has run)

---

### Metrics Table

<!-- screenshot: metrics table with several columns — plddt, ddg, pae_interaction — with one row highlighted -->

**Loading data**

| Source | How |
|--------|-----|
| Built-in (pLDDT, B-factor, residues, chains) | Click **Calculate All** in the Files tab |
| CSV | **Import → CSV**. First column = protein name, remaining = numeric values |
| JSON | **Import → JSON**. Supports flat objects, arrays, and nested AF2/RFdiffusion/ProteinMPNN output |
| Sidecar `.json` | Loaded automatically when the folder is opened |
| Interface metrics | Click **Calculate** or **Batch All** in the Interface panel |

**Interactions**

- Click a column header to sort (click again to reverse).
- Double-click a **row** to load that structure.
- Double-click the **name cell** to rename a row inline.
- Use the **Columns** button to show/hide individual metric columns.
- The status bar shows how many rows are visible vs. total.

**Export** — the **Export CSV** button downloads a CSV of all currently visible rows and columns.

---

### Filtering & Ranking

<!-- screenshot: filter panel with two numeric rules and weighted-sum ranking active -->

**Numeric filters**

Add rules with the **+ Numeric** button. Each rule applies an operator (`>=`, `>`, `<=`, `<`, `=`) to any metric column. Rules stack with AND logic. Filtered rows are dimmed in the file browser too.

**Residue filters**

Add rules with **+ Residue**. Specify a set of target residues (e.g. `B:50, B:52-55`) and a match mode:
- **ANY** — binder contacts at least one specified residue.
- **ALL** — binder contacts every specified residue.
- **COUNT ≥ N** — binder contacts at least N of them.
- **PERCENTAGE ≥ X%** — binder contacts at least X% of them.

Residue filters require batch interface results to be calculated first.

**Ranking**

Two modes:
- **Borda Count** — ranks each metric independently, sums the rank positions. Good when metrics have different scales.
- **Weighted Sum** — normalises each metric to [0, 1] then takes a weighted average. Set weight and direction (maximise / minimise) per metric.

A `rank_score` column is injected into the metrics table and can itself be filtered or plotted.

**Presets** — save the entire filter + ranking configuration as a named preset. Load, delete, or share presets via JSON export/import.

---

### Scatter Plot

<!-- screenshot: scatter plot of ddg vs pae_interaction with a Pareto front highlighted -->

Select any two metric columns as X and Y axes. Click a point to load that structure. Available plot types:

| Type | Use |
|------|-----|
| Scatter | XY correlation (default) |
| Histogram | Distribution of one metric |
| Violin | Distribution with density estimate |
| Ranked | One-dimensional rank order |
| Pareto Front | Highlight non-dominated designs |

**Colour scales**: Teal, Viridis, Plasma, Inferno, RdBu, Turbo — applied to a third metric for colour encoding.

The Pareto Front mode identifies designs that cannot be improved on both axes simultaneously — useful for multi-objective optimisation (e.g. low ΔΔG *and* low PAE).

---

### Interface Analysis

<!-- screenshot: interface panel open showing binder/target chain selectors and the Selection tab with paratope residues listed -->

Identifies which residues on the binder (paratope) are in atomic contact with the target (epitope).

**Setup**

1. Click the **Interface** button in the 3D viewer toolbar.
2. Assign binder chains and target chains (or click **Auto-detect**).
3. Set the distance cutoff (default 4.0 Å) and atom scope (all-heavy atoms or backbone only).
4. Click **Calculate — this structure**.

**What you get**

- Paratope and epitope residue sets highlighted in the 3D viewer and sequence strip.
- The **Selection** tab updates immediately, showing:
  - H-bond count and clash count for the whole interface.
  - Per-side: residue count, net charge, mean hydrophobicity, aromatic count, polar/nonpolar split.
  - The cutoff distance used.
- The 3D viewer switches to interface colour theme automatically.

**Batch calculation**

Click **Batch All → Metrics** to run interface detection across every loaded structure. Results are injected into the metrics table as 15 new columns:

`n_paratope`, `n_epitope`, `n_contacts`, `n_hbonds`, `n_clashes`, `paratope_charge`, `paratope_hydrophobicity`, `paratope_aromatic`, `paratope_polar`, `paratope_nonpolar`, `epitope_charge`, `epitope_hydrophobicity`, `epitope_aromatic`, `epitope_polar`, `epitope_nonpolar`

All columns are available for filtering, ranking, and plotting.

**Persistence** — when you switch to a file that was included in a previous batch run, the Selection tab and the 3D colouring are restored automatically.

> **Note on hydrogen bonds**: H-bond detection uses a heavy-atom proxy (N or O atoms within 3.5 Å). This works correctly for crystal structures, which typically lack explicit hydrogen coordinates.

---

### Sequence Alignment

<!-- screenshot: alignment tab showing four nanobody sequences with CDR regions colour-coded -->

The **Alignment** tab shows a multiple sequence alignment of all loaded structures' binder chains.

- **Colour modes**: Chemical Property (ClustalX-style), Conservation (darker = more conserved), or None.
- **Conservation track**: a bar above the alignment shows column-wise identity.
- **CDR annotations**: if AntPack has run, CDR1/CDR2/CDR3 and FW1–FW4 brackets are rendered above the sequences.
- **Export**: PNG image (with legend) or CSV/TSV.

---

### Selection Panel

The **Selection** tab shows everything currently selected:

- Interface results (paratope/epitope summary + per-residue lists).
- Named epitopes (saved selections from previous sessions).
- Manual residue selections (grouped by chain with compact range notation).

**Tools in the toolbar**: Export selected residues as text, clear all selections.

**Named selections** — save any selection as a named group (via the **Save as Named Epitope** button). Named selections persist across sessions and can be used as reference sets for the Epitope Search.

---

### Structure Comparison

<!-- screenshot: comparison panel with two overlay structures loaded and RMSD values shown -->

`Ctrl/Cmd`-click any file to load it as an overlay. Up to 6 structures can be displayed simultaneously.

The comparison panel (in the viewer sidebar) lists each overlay with:
- A colour swatch (auto-assigned: orange, green, purple, red, brown, pink).
- A visibility toggle.
- An **Align** button — superimposes the overlay onto the primary structure using Cα atoms (reports RMSD).
- A **Remove** button.

---

### RMSD Analysis

Right-click a structure in the file browser → **Set as RMSD Reference**. Then run batch metric calculation — a global `rmsd` column is added to the table for every structure.

With a reference set, the **RMSD Deviation** colour scheme in the viewer shows per-residue Cα displacement as a gradient (blue = low, red = high).

---

### CDR Annotation (AntPack)

If a loaded structure looks like an antibody or nanobody, DesignCampaign automatically runs [AntPack](https://github.com/Wang-lab-UCSD/AntPack) via a bundled Python sidecar process to identify CDR1, CDR2, CDR3, and framework regions using IMGT numbering.

Results appear in:
- The **sequence viewer** — coloured brackets above the residue strip.
- The **alignment tab** — region labels above the MSA.

A confidence threshold slider (All / Medium ≥40% / High ≥70%) hides low-confidence annotations.

**Python setup** — on first launch, the app silently installs a minimal Python environment using `uv`. If Python is not available, a setup modal appears.

---

### Epitope Search

Find every structure in a folder whose binder contacts a specific set of target residues.

1. Define a target residue set (from a named selection, or type residue numbers manually).
2. Set match mode (ANY / ALL / COUNT / PERCENTAGE) and distance cutoff.
3. Click **Search**. A ranked results table shows hit count and coverage % per structure.
4. Double-click a result to load that structure.

---

### UniProt & BLAST Search

The **UniProt** tab provides:
- **UniProt search** — look up proteins by name, gene, or accession. Returns sequence, organism, and function metadata.
- **BLAST (EBI)** — paste or select a chain sequence and submit to the EBI NCBI-BLAST service. Returns hits with E-value, % identity, and query coverage. Polls for results automatically.

---

### Claude AI Chat

<!-- screenshot: chat panel with a multi-turn conversation, showing a tool-call pill expanded -->

The **Chat** tab embeds a Claude assistant that is aware of the current app state. Set your Anthropic API key via the **Set API Key** button.

**What Claude can do**:
- Export and interpret the current metrics table.
- Load a structure by name.
- Apply filter rules.
- Retrieve current selections or sequences.
- Explain structures, suggest ranking strategies, or answer biology questions.

Tool calls appear as expandable pills in the conversation thread. The context sent to Claude includes loaded files, current metrics, active filters, and selections.

---

### Marimo Notebook

Click **Notebook** in the title bar to switch the right panel to an embedded [Marimo](https://marimo.io/) reactive Python notebook. The notebook has live access to the app's current state (active file, filtered structures, metrics).

Switch back to **Viewer** at any time — the notebook is kept alive in the background.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+O` | Open folder |
| `Ctrl/Cmd+R` | Refresh file list |
| `Ctrl/Cmd`+click | Load file as comparison overlay |
| Double-click row | Load structure / rename cell |
| `Enter` | Send chat message |
| `Shift+Enter` | Newline in chat |
| `Escape` | Close modals, cancel editing |

---

## Example Data

The `examples/` directory contains 8 publicly available antibody and nanobody crystal structures from the RCSB PDB, each with a companion `.json` sidecar of pre-computed design metrics.

See [`examples/README.md`](examples/README.md) for the full list and suggested exercises.

**Suggested workflow with the examples**:
1. Open the `examples/` folder.
2. Click **Calculate All** to extract built-in metrics.
3. In **Filter**, add a rule `ddg < -40` to keep only tight binders, then rank by `pae_interaction`.
4. In **Plot**, set X = `ddg`, Y = `pae_interaction`, type = **Pareto Front**.
5. Load `1ZVH`, set binder chain `A` and target chain `L` in the **Interface** panel, and click **Calculate**.

---

## Limitations

| Area | Limitation |
|------|-----------|
| **File size** | Files over 100 MB display a warning and may load slowly. Very large assemblies (>50 chains) can cause the viewer to lag. |
| **File formats** | Only `.pdb`, `.cif`, and `.mmcif` are supported. No `.mol2`, `.sdf`, or trajectory formats. |
| **H-bond detection** | Uses a heavy-atom proxy (N/O within 3.5 Å) rather than explicit H-atom geometry. Results are approximate and may differ from programs that place hydrogens explicitly. |
| **CDR annotation** | Requires Python and the AntPack package. Only IMGT numbering is exposed in the UI. Works on antibody/nanobody chains; will silently skip non-antibody chains. |
| **Batch interface** | All files must share the same binder/target chain assignments. Mixed-chain-layout folders require separate runs. |
| **Sequence grouping** | Groups by exact sequence identity. Near-identical sequences (e.g. point mutations) are placed in separate groups. |
| **Comparison overlays** | Limited to 6 simultaneous overlay structures. More overlays can be loaded but the colour palette wraps. |
| **Metrics import** | Only numeric values are imported from CSV/JSON. String-valued columns are ignored. |
| **BLAST** | Uses the EBI public API — subject to rate limits and requires an internet connection. |
| **App signing** | The app is not code-signed. macOS and Windows will show a first-run security warning (see [First-run security warnings](#first-run-security-warnings)). |

---

## Roadmap

| Feature | Status | Notes |
|---------|--------|-------|
| **Metric correlation heatmap** | Deferred | Component implemented (`CorrelationHeatmap.tsx`) but hidden from UI. Re-enable by restoring the `corr` tab in `AppShell.tsx`. |
| **Grid view** | Planned | Side-by-side linked Mol* viewports. Feasibility capped at ~4 simultaneous viewers. |
| **Export to notebook** | Planned | "Generate code" button that outputs reproducible Python/Marimo for the current view state. Marimo tab already present; generator pending. |
| **CDR/FW labels in alignment** | Planned | IMGT region boundaries already computed by the Python sidecar; front-end rendering pass pending. |

---

## Development

```bash
cd designcampaign-web
npm install
npm run dev        # Electron + Vite dev server (hot reload)
npm test           # Vitest unit tests
npm run typecheck  # TypeScript type check
npm run build      # Production build
npm run dist       # Package installers (requires electron-builder)
```

### Project structure

```
designcampaign-web/
  electron/          Main process, IPC handlers, auto-updater
  python/            Python sidecar (AntPack CDR numbering)
  src/
    components/      React UI (viewer, tables, panels, plots)
    lib/             Parsers, calculators, utilities
    stores/          Zustand state stores
    workers/         Web Workers (interface calc, RMSD)
  public/
```

### Release a new version

```bash
cd designcampaign-web
npm version patch             # bumps version, commits, creates git tag
git push && git push --tags   # GitHub Actions builds all three platforms (~10 min)
```

Then review the draft release on GitHub and click **Publish**.

### Tech stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron |
| UI framework | React + TypeScript |
| Build tool | Vite |
| Styling | Tailwind CSS |
| State | Zustand |
| 3D viewer | Mol* (molstar) |
| Plotting | Plotly.js |
| Notebook | Marimo |
| Python tooling | uv |
| Tests | Vitest |

---

## Screenshots

Screenshots are not yet included in this README. To add them:

1. Run the app (`npm run dev`) and load the `examples/` folder.
2. Take screenshots of each major feature (file browser, metrics table, filter panel, 3D viewer with interface colours, scatter plot, alignment tab).
3. Save them to `docs/screenshots/` and replace the `<!-- screenshot: ... -->` comments above with `![caption](docs/screenshots/filename.png)`.

Suggested screenshots:
- Main window with metrics table and 3D viewer side-by-side
- Interface analysis with paratope/epitope coloured in viewer + Selection tab open
- Filter panel with numeric and residue rules active
- Scatter plot showing Pareto front
- Alignment tab with CDR annotations
- Chat panel with a tool-call pill expanded
