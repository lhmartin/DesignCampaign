# Technology Stack Recommendation

## Recommended Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **3D Viewer** | Mol* (Molstar) | Industry standard, used by RCSB PDB & AlphaFold DB |
| **UI Framework** | React 18+ with TypeScript | Mol* is built on React; best integration path |
| **Component Library** | shadcn/ui + Tailwind CSS | Modern, composable, no vendor lock-in |
| **State Management** | Zustand | Lightweight, TypeScript-first, no boilerplate |
| **Data Tables** | TanStack Table (React Table v8) | Virtualized, sortable, filterable — ideal for metrics |
| **Plotting** | Plotly.js or Recharts | Interactive scatter plots, scientific charts |
| **Build Tool** | Vite | Fast builds, excellent TypeScript support |
| **Desktop Packaging** | Electron | Mature, consistent WebGL rendering across platforms |
| **Structure Parsing** | Mol* built-in parsers | Handles PDB, mmCIF, SDF, and more natively |
| **Testing** | Vitest + Playwright | Unit + E2E testing |

---

## Detailed Rationale

### 3D Viewer: Mol*

**Why Mol* over py3Dmol/3Dmol.js:**

- Mol* is the successor generation of molecular viewers. It is used in production by:
  - RCSB Protein Data Bank (`rcsb-molstar`)
  - EMBL-EBI / PDBe (`pdbe-molstar`)
  - AlphaFold Database
- Features py3Dmol lacks:
  - Volumetric rendering (electron density maps, cryo-EM)
  - Built-in sequence viewer with structure mapping
  - Advanced representations (gaussian surface, molecular surface)
  - Measurement tools (distances, angles, dihedrals)
  - Annotation system
  - Symmetry and assembly display
  - State snapshots and sessions
  - Extension/plugin architecture
- Mol* is written in TypeScript and has a React-based UI (`mol-plugin-ui`)
- Has both high-level wrappers (`molstar-react`) and low-level programmatic API

**Integration approach:**
- Use `molstar` npm package directly with `createPluginUI`
- This gives full programmatic control over the viewer
- Can customize the UI, add custom panels, and control visualization programmatically
- The `molstar-react` wrapper is simpler but less flexible

**Key resources:**
- [Mol* GitHub](https://github.com/molstar/molstar)
- [Mol* Developer Docs](https://molstar.org/docs/plugin/instance/)
- [molstar-react](https://github.com/samirelanduk/molstar-react)

### UI Framework: React + TypeScript

**Why React:**
- Mol* itself is built with React — its UI layer (`mol-plugin-ui`) is React components
- Largest ecosystem of component libraries, tools, and community support
- TypeScript-first development for type safety across the entire app
- React 18+ with concurrent features for responsive UIs during heavy computation

**Why not Vue/Svelte:**
- Vue/Svelte would require wrapping Mol* in a web component or iframe, adding complexity
- React's component model matches Mol*'s architecture
- Larger pool of developers familiar with React

### Component Library: shadcn/ui + Tailwind CSS

**Why shadcn/ui:**
- Not a traditional component library — it gives you the source code for each component
- Built on Radix UI primitives (accessible, composable)
- Tailwind CSS for styling — utility-first, no CSS-in-JS runtime cost
- Components you'll need are available out of the box:
  - `Tabs` — for viewer/metrics/plot/selection tabs
  - `Table` — base for metrics table
  - `Slider` — for distance cutoffs, thresholds
  - `Select`, `Combobox` — for chain selection, color scheme pickers
  - `Dialog`, `Sheet` — for comparison panel, settings
  - `Collapsible` — for panel sections
  - `Resizable` — for splitter panels
  - `Progress` — for batch operations
  - `Tooltip` — for residue hover info
  - `Command` — for search/filter interfaces
- No vendor lock-in: you own the components and can modify them freely

**Why not Material UI / Ant Design:**
- Heavier bundle size
- Opinionated styling that fights with Mol*'s own styles
- Less flexible for the kind of custom scientific UI we need

### State Management: Zustand

**Why Zustand:**
- Minimal boilerplate (no reducers, actions, dispatchers)
- TypeScript-first with excellent type inference
- Works naturally with React without providers/context wrappers
- Supports middleware (persist, devtools, immer)
- Perfect for our state needs:
  - Currently loaded protein and its metadata
  - Selected residues set
  - Active color scheme and visualization style
  - Metrics data and filter state
  - File list and grouping state
  - Comparison/alignment state

### Data Tables: TanStack Table

**Why TanStack Table:**
- Headless — renders however you want (pairs with shadcn/ui)
- Built-in sorting, filtering, pagination, column visibility
- Virtualization support for large datasets (thousands of proteins)
- TypeScript-first API
- Replaces the custom QTableView + QSortFilterProxyModel from PyQt

### Plotting: Plotly.js (or Recharts)

**Plotly.js pros:**
- Scientific-grade plotting with zoom, pan, hover
- Scatter plots with click-to-select points (matching current pyqtgraph behavior)
- Wide format support (SVG export, etc.)
- Used extensively in scientific Python (same team as Dash)

**Recharts alternative:**
- Lighter weight, React-native
- Good for simpler scatter plots
- Less scientific-oriented

Recommend **Plotly.js** for feature parity with pyqtgraph.

### Build Tool: Vite

**Why Vite:**
- Fastest development server with HMR (hot module replacement)
- Native TypeScript support
- Optimized production builds with Rollup
- First-class support for React
- Works seamlessly with Electron via `electron-vite`

**Why not Next.js:**
- Next.js is a full-stack framework with SSR — overkill for a desktop app
- Adds complexity (routing, server components) we don't need
- Vite is simpler and more appropriate for an SPA/desktop app

### Desktop Packaging: Electron

**Why Electron over Tauri:**

| Factor | Electron | Tauri v2 |
|--------|---------|---------|
| **App size** | ~80-150 MB | ~3-10 MB |
| **Memory** | ~200-300 MB | ~30-50 MB |
| **WebGL consistency** | Consistent (bundled Chromium) | Varies by OS webview |
| **Maturity** | Very mature, battle-tested | Growing rapidly but younger |
| **Mol* compatibility** | Proven (Chromium) | Untested with OS webviews |
| **Node.js access** | Native | Requires Rust bridge |
| **Dev experience** | All JavaScript/TypeScript | Requires Rust knowledge |

**The critical factor: WebGL rendering consistency.**

Mol* relies heavily on WebGL for 3D rendering. Electron bundles Chromium, guaranteeing consistent WebGL behavior across all platforms. Tauri uses the OS's native webview (WebView2 on Windows, WKWebView on macOS, WebKitGTK on Linux), which can have different WebGL implementations, bugs, and feature support. For a molecular visualization app where rendering fidelity matters, Electron's consistency is worth the larger binary size.

**However**, Tauri v2 is a viable future migration path once its webview layer matures. The web app itself (React + Mol*) would work in either shell with minimal changes.

**Recommended Electron tooling:**
- `electron-vite` — Vite-based build for Electron
- `electron-builder` — Cross-platform packaging and auto-updates

### Structure Parsing

**Moving away from Biotite/Python:**
- Mol* has its own built-in parsers for PDB, mmCIF, SDF, MOL2, and more
- These run in the browser (JavaScript/TypeScript)
- No need for a Python backend for structure parsing
- Mol*'s parsers handle:
  - Atom coordinates and metadata
  - Secondary structure assignment
  - Sequence extraction
  - Chain identification
  - B-factor / pLDDT extraction

**What needs reimplementation in TypeScript:**
- SASA/RASA calculation (currently biotite)
- KD-tree interface detection (currently scipy)
- Sequence-based grouping (currently custom Python)
- Metrics aggregation

These can be implemented using:
- `kdtree` npm packages for spatial queries
- WebAssembly for performance-critical calculations
- Web Workers for non-blocking computation

---

## Alternative Stacks Considered

### Option B: Svelte + Tauri
- Pros: Smallest bundle, fastest runtime, Rust backend
- Cons: Must wrap Mol* awkwardly, smaller ecosystem, Rust learning curve, webview inconsistencies

### Option C: Vue + Electron
- Pros: Vue is simpler than React, good DX
- Cons: Mol* integration is less natural, fewer scientific component libraries

### Option D: Plain TypeScript (no framework) + Mol*
- Pros: Minimal dependencies, direct Mol* API usage
- Cons: Must build all UI from scratch, no component library benefits, more code to maintain

**Recommendation: Option A (React + Electron) is the safest path** given Mol*'s React foundation and the need for consistent WebGL rendering.
