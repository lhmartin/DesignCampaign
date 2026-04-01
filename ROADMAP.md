# DesignCampaign — Roadmap

## Active Plan

### ~~Metric Correlation Heatmap~~ *(deferred — hidden from UI)*
An NxN Pearson correlation matrix of all visible numeric columns (RdBu diverging scale, −1 → +1). Respects hidden columns and active filters. Component is implemented but the tab is hidden until there's enough user demand and interactivity (e.g. click a cell to highlight correlated rows) to justify the screen real estate.

To re-enable: restore `TabsTrigger` (Grid2x2, value="corr") and `TabsContent` (forceMount, value="corr") in `AppShell.tsx` and re-import `CorrelationHeatmap`.

- `src/components/metrics/CorrelationHeatmap.tsx` ✅ (exists, unused)

---

## UX / Readability Polish

Small global changes identified during design audit — low effort, meaningful improvement:

| Item | Detail |
|------|--------|
| **Minimum text size 11px** | Most of the UI runs at 10px (buttons, table cells, toolbar labels). 10px should be reserved for truly tertiary hints only; general UI text should floor at 11px. |
| **Disabled text contrast** | `--color-text-disabled: #5a7399` (dark theme) is 3.6:1 — fails WCAG AA for small text (<14px). Raise to `#7090bb` to match `--color-text-secondary` intent. |
| **Tab group separator** | The 1px divider between Filter and Selection tabs is too subtle. A 2px separator or slight background tint on the utility group (Selection / UniProt / Chat) would clarify the two sections of the tab bar. |
| **Metric value weight** | Numeric values in the metrics table use `font-weight: 400`. Bumping to `500` in JetBrains Mono gives them more visual presence at 10–11px without changing layout. |

---

## Backlog

| Feature | Notes |
|---------|-------|
| **Interface analysis (h-bonds, clashes)** | Contact-based paratope/epitope detection is implemented. Missing: explicit h-bond/clash detection and per-residue CSV export of interface contacts. |
| **Grid view** | Linked Mol* viewports. Investigate feasibility first — limited to ~4 simultaneous viewers. |
| **Export to notebook** | Auto-generate reproducible Python/Marimo code from current viewer state (selections, filters, rankings, colouring). Marimo tab already launched; this feature would add a "Generate code" button. |
| **CDR/FW region labels in alignment tab** | Render CDR and framework region annotations above the aligned sequences. IMGT boundaries are already computed in `python/sidecar.py` (`_imgt_region`) and returned per-residue via `antpack_number`; front-end just needs to consume the `assignments` array and render region headers/brackets. |
