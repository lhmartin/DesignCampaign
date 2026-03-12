# DesignCampaign Web Migration — Quickstart for New Claude Code Session

## Initial Prompt

Copy and paste this into a new Claude Code session to get started:

---

```
I'm building a desktop application called DesignCampaign for viewing, filtering, and analyzing
large protein design campaigns. I have a complete set of specifications in the `specs/` directory
that describe the migration from a Python/PyQt6 app to a modern web stack.

The specs are:
- 01-project-overview.md — What the app does and why we're migrating
- 02-technology-stack.md — Chosen technologies with rationale
- 03-feature-inventory.md — Complete catalog of all features to implement
- 04-architecture.md — Proposed directory structure, component design, state management
- 05-migration-roadmap.md — 6-phase implementation plan with dependencies
- 06-molstar-integration-guide.md — py3Dmol → Mol* API mapping with TypeScript code examples
- 07-reference-data.md — All constants, algorithms, data formats, and config schemas

Please read all spec files in order, then start implementing Phase 1 from the migration roadmap:
1. Initialize the project (Vite + React + TypeScript + Electron + Tailwind + shadcn/ui)
2. Set up the Electron main process with IPC for file system access
3. Create a basic Mol* viewer component that loads a PDB file
4. Build a minimal file browser that opens a folder and lists .pdb/.cif files

After Phase 1, proceed through subsequent phases. Each phase has acceptance criteria in
05-migration-roadmap.md. Ask me if anything is unclear.
```

---

## How These Specs Are Organized

| File | Purpose | When to Read |
|------|---------|-------------|
| `01-project-overview.md` | Context: what the app does, who uses it, why migrate | Read first for context |
| `02-technology-stack.md` | Every library/tool chosen and why | Reference during setup |
| `03-feature-inventory.md` | All 18 features with behavior descriptions | Reference during each phase |
| `04-architecture.md` | Directory layout, component tree, store interfaces | Reference during implementation |
| `05-migration-roadmap.md` | Phased plan with tasks, dependencies, acceptance criteria | Follow as implementation guide |
| `06-molstar-integration-guide.md` | TypeScript code for every Mol* operation | Reference during viewer work |
| `07-reference-data.md` | Constants, algorithms, data formats (self-contained) | Reference during implementation |

## Key Decisions Already Made

These decisions have been researched and finalized. Do not second-guess them:

1. **Mol*** for 3D visualization (not 3Dmol.js, not NGL Viewer)
2. **React 18+ with TypeScript** (not Vue, not Svelte) — Mol* is built on React
3. **Vite** for build tooling (not Next.js, not webpack)
4. **Electron** for desktop packaging (not Tauri) — WebGL consistency matters
5. **shadcn/ui + Tailwind CSS** for components (not MUI, not Ant Design)
6. **Zustand** for state management (not Redux, not Context API)
7. **TanStack Table** for data tables (not AG Grid, not custom)
8. **Plotly.js** for scatter plots (not Recharts, not D3 directly)

## What the New Session Does NOT Need

- Access to the Python source code — all algorithms and data are extracted into specs
- Knowledge of PyQt6 — the web migration is a full rewrite
- Python or pip — this is a pure TypeScript/JavaScript project

## Project Structure to Create

The new session should create a project called `designcampaign-web/` (or similar) as a sibling or subfolder. The directory structure is defined in `04-architecture.md`.
