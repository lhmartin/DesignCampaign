# DesignCampaign

Desktop application for analysing protein structure design campaigns. Load a folder of PDB files, explore metrics, visualise structures, and run interactive Python analysis — all in one place.

## Features

- **File browser** — tree and grouped views; groups structures by target chain sequence automatically
- **Metrics table** — parses sidecar JSON files, supports filtering, sorting, ranking by weighted score, and CSV export
- **Scatter plot** — interactive XY scatter and Pareto-front view with per-axis direction toggles; axis selections persist across sessions
- **3D viewer** — Mol* structure viewer with pLDDT colouring, per-residue RMSD deviation, and interface highlighting
- **Sequence alignment** — star-alignment of binder sequences with ClustalX/conservation colour modes, CDR/FW region annotations, and PNG export
- **Interface analysis** — auto-detects paratope/epitope residue contacts; bulk RMSD column with reference structure
- **CDR annotation** — AntPack IMGT/Chothia/AHo CDR numbering via Python sidecar; CDR1/2/3 highlighted in sequence viewer and 3D
- **Epitope search** — define a named selection, find all structures where binder contacts that epitope
- **UniProt search** — gene/accession lookup and BLAST-like sequence search via EBI REST API
- **Claude chat** — Claude API integration for AI-assisted analysis
- **Marimo notebook** — embedded reactive Python notebook with live context sync (active file, filtered structures, metrics)

## Quick start

```bash
npm install
npm run dev        # development (hot-reload)
npm run build      # production build
npm run dist       # package installers (requires electron-builder)
```

On first launch the app silently installs a Python environment (via `uv`) for CDR annotation. No manual Python setup needed.

## Releases

Pre-built installers for Windows, macOS, and Linux are available on the [Releases](../../releases) page.

| Platform | Format |
|----------|--------|
| Windows | NSIS installer + portable `.exe` |
| macOS | `.dmg` |
| Linux | `.AppImage` + `.deb` |

## Development

```
designcampaign-web/
  electron/        # main process + IPC handlers
  python/          # sidecar (AntPack CDR numbering)
  src/
    components/    # React UI
    hooks/         # custom hooks
    lib/           # parsers, calculations
    stores/        # Zustand state
    types/         # TypeScript types
  public/
```

Built with Electron, React, TypeScript, Vite, Tailwind CSS, Mol*, and Zustand.
