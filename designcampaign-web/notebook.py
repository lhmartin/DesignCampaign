import marimo

__generated_with = "0.11.0"
app = marimo.App(width="medium")


@app.cell
def _():
    import marimo as mo
    import pandas as pd
    import json
    import os
    return json, mo, os, pd


@app.cell
def _(json, mo, os, pd):
    _context_path = "/home/luke/.config/designcampaign-web/marimo_context.json"
    _metrics_path = "/home/luke/.config/designcampaign-web/marimo_metrics.csv"

    _ctx = json.load(open(_context_path)) if os.path.exists(_context_path) else {}
    _df = pd.read_csv(_metrics_path) if os.path.exists(_metrics_path) else pd.DataFrame()

    mo.vstack([
        mo.md(f"## DesignCampaign — {len(_ctx.get('filtered_files', []))} filtered structures"),
        mo.md(f"**Folder:** `{_ctx.get('current_folder', 'N/A')}`  |  "
              f"**Active file:** `{_ctx.get('active_file', 'N/A')}`"),
        mo.ui.table(_df) if not _df.empty else mo.md("_No metrics loaded yet — open a folder with metrics in DesignCampaign._"),
    ])


if __name__ == "__main__":
    app.run()
