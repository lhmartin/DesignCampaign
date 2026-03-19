# DesignCampaign — Roadmap

## Active Plan

### ✅ Alignment Sequence Viewer
Star-alignment of binder sequences across all loaded structures. Chemical (ClustalX) and conservation colour modes. PNG export with legend. Auto-detects binder chain by sequence variability across the folder.

---

### Metric Correlation Heatmap
A new **Corr** tab: NxN Pearson correlation matrix of all visible numeric columns rendered as a Plotly heatmap (RdBu diverging scale, −1 → +1). Respects hidden columns and active filters. Pure JS — no new dependencies.

- `src/components/metrics/CorrelationHeatmap.tsx` (new)
- `src/components/layout/AppShell.tsx` — add Corr tab

---

### Python Sidecar + AntPack CDR Numbering
Long-lived Python subprocess communicating via newline-delimited JSON on stdin/stdout. AntPack annotates CDR/FW regions (IMGT/Chothia/AHo). CDR highlighting in sequence viewer (CDR1 red, CDR2 orange, CDR3 yellow). Injects `cdr_h1_len` / `cdr_h2_len` / `cdr_h3_len` columns into the metrics table. Graceful error if Python or AntPack not installed.

- `python/sidecar.py` (new)
- `electron/ipc-handlers.ts` — `python:call` IPC handler
- `electron/preload.ts` + `electron.d.ts` — expose `window.electron.python.call`
- `src/lib/python-bridge.ts` (new)
- `src/stores/antpack-store.ts` (new)
- `src/components/viewer/SequenceViewer.tsx` — CDR colour mode + CDR button

---

### Export + Persistent Session
Two small features:
1. **Export CSV** scoped to filtered rows + visible columns only; **Copy paths** button (one file path per line to clipboard)
2. **Persistent session** — reopen last folder, restore hidden columns and tree/groups view mode on app restart via zustand `persist`

- `src/stores/metrics-store.ts` — `exportFilteredCSV()`
- `src/components/metrics/MetricsTable.tsx` — replace Export CSV button with filtered CSV + copy paths
- `src/stores/file-store.ts` — persist `currentFolder`
- `src/stores/metrics-store.ts` — persist `hiddenColumns`
- `src/stores/group-store.ts` — persist `viewMode`
- `src/components/layout/AppShell.tsx` — auto-restore folder on mount

---

### Four UI Feedback Fixes
1. **Ranking weight input** — replace read-only span with `<input type="number">` so users can type exact values
2. **Plot tab state** — add `forceMount` to Plot `TabsContent` so x/y axis selection survives tab switches
3. **File browser toggle** — move `viewMode` from local state to group-store so tree/groups persists across tab switches
4. **Sequence viewer clipping** — fix `residuesPerRow` padding constant (16 → 24) so rightmost residues aren't clipped

- `src/components/filter/FilterPanel.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/ui/tabs.tsx`
- `src/stores/group-store.ts`
- `src/components/files/FileBrowser.tsx`
- `src/components/viewer/SequenceViewer.tsx`

---

### Update README
Rewrite `README.md` into a compelling project page: hero tagline, feature overview (file browser, metrics table, filtering/ranking, interface detection, 3D viewer, scatter plot, alignment), screenshot placeholders, quick-start steps, download section, dev section.

---

### v0.1.0 Release
Fix two `electron-builder.json5` bugs (copyright year, NSIS/portable artifact name collision), then tag and push `v0.1.0` to trigger the GitHub Actions release workflow (Windows installer + portable, macOS DMG, Linux AppImage + deb).

---

## Backlog

| Feature | Notes |
|---------|-------|
| **Residue-level colouring from sidecar** | Per-residue values (e.g. AF2 pLDDT/confidence) already partially supported via `residueValues` Map in SequenceViewer. Extend Mol* colour scheme. |
| **Bulk RMSD column** | Load reference PDB, compute CA-RMSD for all structures, inject as metric. Builds on existing `MinimizeRmsd` code. |
| **Per-residue RMSD colouring** | Compute per-residue deviation vs reference, drive Mol* custom colour scheme. |
| **Epitope target search** | Manual text input + pick-from-viewer. Compare against detected epitope residues already in metrics. |
| **Interface analysis (h-bonds, clashes)** | Summary panel + per-residue CSV. Likely Python (BioPython/ProDy) via sidecar. |
| **Grid view** | Linked Mol* viewports. Investigate feasibility first — limited to ~4 simultaneous viewers. |
| **Export to notebook** | Jupyter + Marimo. Generate reproducible Python code from current state. Python sidecar prerequisite already planned. |
| **UniProt search** | Accession lookup + BLAST-like sequence search. REST API, no auth needed. |
| **Chatbot (Claude)** | Claude API via electron main process. Keep Python sidecar IPC pattern in mind. |
| **Marimo tab** | Python sidecar prerequisite. |
| **Explicit binder/target chain designation** | Alignment currently infers binder chain by sequence variability. A future flow would let users explicitly designate chains — globally via the interface detection panel or per-structure. |
