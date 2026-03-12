# DesignCampaign: Web UI Migration - Project Overview

## What Is DesignCampaign?

DesignCampaign is a desktop application for viewing, filtering, and analyzing large protein design campaigns. It is used for protein drug design workflows where a researcher needs to evaluate many candidate protein structures against computed metrics, visualize their 3D structures, identify interface residues between binder and target chains, and compare/align multiple structures.

## Current Technology Stack (Python/PyQt6)

| Component | Technology |
|-----------|-----------|
| Language | Python 3.10+ |
| GUI Framework | PyQt6 6.6.0+ |
| 3D Viewer | py3Dmol (3Dmol.js via QWebEngineView) |
| Structure Parsing | Biotite 1.0+ (vectorized analysis) |
| Spatial Analysis | SciPy cKDTree |
| Data Handling | Pandas, NumPy |
| Plotting | pyqtgraph 0.13+ |
| Package Manager | uv |
| Testing | pytest |

## Why Migrate?

### Current Limitations

1. **py3Dmol is limited**: It provides basic molecular visualization but lacks the advanced features of Mol* (volumetric data, density maps, advanced representations, built-in sequence viewer, measurement tools, annotations, symmetry display).

2. **PyQt6 is constrained**: Building complex, responsive UIs with splitters, tabs, and synchronized panels is verbose and fragile. The main window file alone is 2000+ lines. Modern web frameworks handle complex layouts, animations, and responsive design far more naturally.

3. **QWebEngineView bridge is brittle**: The current app already renders 3D via JavaScript (3Dmol.js) inside a QWebEngineView, communicating through QWebChannel. This Python↔JS bridge adds complexity and latency. Moving to a pure web stack eliminates this indirection.

4. **Distribution is painful**: Python desktop apps are notoriously hard to package and distribute. Users need Python installed, dependencies managed, and platform-specific Qt binaries.

5. **Limited ecosystem**: The web ecosystem for data visualization, component libraries, and scientific tools dwarfs what's available in PyQt6.

### What We Gain

- **Mol* viewer**: Feature-rich, GPU-accelerated molecular viewer used by RCSB PDB, EMBL-EBI, and AlphaFold DB
- **Rich UI framework**: React + modern component libraries for complex interactive layouts
- **Cross-platform distribution**: Electron or Tauri for installable desktop apps on Windows, macOS, Linux
- **Web-first**: Could also deploy as a web app, not just desktop
- **Larger contributor pool**: Web developers far outnumber PyQt developers

## Project Scope

This migration aims to rebuild all existing features in a modern web stack while maintaining the same core workflows:

1. Load a folder of protein structures (PDB/mmCIF)
2. Browse, group, and filter structures by metrics
3. Visualize structures in 3D with multiple styles and color schemes
4. Select residues and analyze interfaces
5. Compare/align multiple structures
6. Import/export metrics (CSV/JSON)

## Target Users

- Computational biologists running protein design campaigns
- Structural biologists analyzing AlphaFold predictions
- Drug design researchers evaluating binder candidates
- Academic researchers working with large sets of predicted structures
