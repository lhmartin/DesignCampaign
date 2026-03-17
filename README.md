# DesignCampaign

A desktop application for viewing and analysing sets of protein structures. Designed for working with the outputs of protein design pipelines — load a folder of PDB/CIF files, extract or import metrics, filter, rank, and visualise.

[![Windows](https://img.shields.io/badge/Windows-0078D6?logo=windows&logoColor=white)](https://github.com/lhmartin/DesignCampaign/releases)
[![macOS](https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white)](https://github.com/lhmartin/DesignCampaign/releases)
[![Linux](https://img.shields.io/badge/Linux-FCC624?logo=linux&logoColor=black)](https://github.com/lhmartin/DesignCampaign/releases)

<!-- screenshot: main window — metrics table (left panel) + 3D structure viewer (right panel) -->

---

## Features

### File browser
- Open a folder of `.pdb` / `.cif` files; subdirectories scanned automatically
- Adjacent `.json` sidecar files are loaded and merged automatically as metric columns
- Files grouped by chain sequence identity
- Ctrl/Cmd-click a file to load it as a comparison overlay in the viewer

### Metrics table
- Built-in metrics calculated directly from PDB coordinates: `mean_plddt`, `mean_bfactor`, `num_residues`, `chain_count`
- Import additional metrics from CSV or JSON (compatible with AF2, RFdiffusion, ProteinMPNN output formats)
- Sortable and hideable columns; inline row rename; export to CSV

<!-- screenshot: metrics table with several columns and rows loaded -->

### Filtering & ranking
- Numeric filter rules (`>=`, `>`, `<=`, `<`, `=`) on any column
- Residue filter rules: filter by paratope or epitope residue presence (ANY or ALL mode; chain-qualified specs supported)
- Two ranking modes: **Borda count** (rank sum) and **weighted sum**
- Per-metric direction (maximise / minimise) and weight; configurations saved as named presets

<!-- screenshot: filter panel with numeric rules and ranking configured -->

### Interface detection
- Designate binder and target chains; computes atomic contacts within a configurable distance cutoff
- Atom scope: all-heavy atoms or backbone only
- Paratope and epitope residue sets injected as `paratope_residues` / `epitope_residues` columns in the metrics table, available for filtering

<!-- screenshot: interface detection panel with paratope/epitope residues highlighted in the 3D viewer -->

### 3D viewer
- [Mol*](https://molstar.org/) viewer embedded in the application
- Representations: cartoon, ball-and-stick, spacefill, wireframe, Gaussian surface
- Colour schemes: chain ID, secondary structure, pLDDT/B-factor, hydrophobicity, element, N→C spectrum
- Load multiple structures simultaneously as overlays; CA-atom RMSD alignment
- Integrated sequence strip with residue-level selection

### Scatter plot
- Plot any two metric columns against each other
- Click a point to load that structure in the viewer

---

## Quick start

1. Open a folder containing `.pdb` or `.cif` files using **File → Open Folder**
2. Click **Calculate All** to extract built-in metrics, or use **Import CSV / JSON** to load pre-computed scores
3. Use the **Filter** tab to add numeric rules and apply ranking; a `rank_score` column is injected into the table
4. Double-click a row to load the corresponding structure in the 3D viewer
5. Ctrl/Cmd-click a file to overlay it as a comparison; click **Align** to compute RMSD

---

## Download

Pre-built installers are available on the [Releases page](https://github.com/lhmartin/DesignCampaign/releases).

| Platform | File |
|----------|------|
| Windows (installer) | `DesignCampaign-Windows-Setup-*.exe` |
| Windows (portable) | `DesignCampaign-Windows-Portable-*.exe` |
| macOS | `DesignCampaign-macOS-*.dmg` |
| Linux | `DesignCampaign-Linux-*.AppImage` or `*.deb` |

### First-run security warnings

The app is not code-signed. Your OS will warn you the first time you open it.

**macOS** — Right-click the `.app` inside the DMG → **Open** → click **"Open Anyway"** in the dialog.
If you've already dismissed the warning, go to **System Settings → Privacy & Security** and click **"Open Anyway"** next to the DesignCampaign entry.

**Windows** — Click **"More info"** in the SmartScreen popup, then **"Run anyway"**.

---

## Development

```bash
cd designcampaign-web
npm install
npm run dev        # Electron + Vite dev server
npm test           # Vitest unit tests
npm run typecheck  # TypeScript check
```

### Release a new version

```bash
cd designcampaign-web
npm version patch             # bumps version, commits, creates git tag
git push && git push --tags   # GitHub Actions builds all platforms (~10 min)
```

Then review the draft release on GitHub and click **Publish**.
