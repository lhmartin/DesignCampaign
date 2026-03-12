# Proposed Architecture for Web Migration

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Electron Shell                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │                 Main Process (Node.js)                 │  │
│  │  - File system access (read PDB/CIF files)           │  │
│  │  - Native dialogs (open folder, save file)           │  │
│  │  - Window management                                  │  │
│  │  - Auto-updates                                       │  │
│  └───────────────┬───────────────────────────────────────┘  │
│                  │ IPC (contextBridge)                       │
│  ┌───────────────┴───────────────────────────────────────┐  │
│  │              Renderer Process (Chromium)               │  │
│  │  ┌─────────────────────────────────────────────────┐  │  │
│  │  │              React Application                   │  │  │
│  │  │                                                  │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐   │  │  │
│  │  │  │ File     │ │ Mol*     │ │ Metrics       │   │  │  │
│  │  │  │ Browser  │ │ Viewer   │ │ Table/Plot    │   │  │  │
│  │  │  └──────────┘ └──────────┘ └───────────────┘   │  │  │
│  │  │                                                  │  │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌───────────────┐   │  │  │
│  │  │  │ Selection│ │ Sequence │ │ Comparison    │   │  │  │
│  │  │  │ Panel    │ │ Viewer   │ │ Panel         │   │  │  │
│  │  │  └──────────┘ └──────────┘ └───────────────┘   │  │  │
│  │  │                                                  │  │  │
│  │  │  ┌────────────────────────────────────────────┐ │  │  │
│  │  │  │          Zustand State Store                │ │  │  │
│  │  │  └────────────────────────────────────────────┘ │  │  │
│  │  │                                                  │  │  │
│  │  │  ┌────────────────────────────────────────────┐ │  │  │
│  │  │  │      Web Workers (heavy computation)       │ │  │  │
│  │  │  │  - SASA calculation                        │ │  │  │
│  │  │  │  - KD-tree interface detection             │ │  │  │
│  │  │  │  - Sequence hashing & grouping             │ │  │  │
│  │  │  └────────────────────────────────────────────┘ │  │  │
│  │  └─────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Directory Structure

```
designcampaign-web/
├── electron/
│   ├── main.ts                    # Electron main process
│   ├── preload.ts                 # Context bridge (IPC API)
│   └── ipc-handlers.ts            # File system handlers
├── src/
│   ├── App.tsx                    # Root component
│   ├── main.tsx                   # React entry point
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppShell.tsx       # Main layout with resizable panels
│   │   │   ├── Sidebar.tsx        # Left panel container
│   │   │   └── TabPanel.tsx       # Right panel with tabs
│   │   │
│   │   ├── viewer/
│   │   │   ├── MolstarViewer.tsx  # Mol* integration wrapper
│   │   │   ├── ViewerControls.tsx # Style/color controls
│   │   │   └── hooks/
│   │   │       └── useMolstar.ts  # Mol* plugin lifecycle hook
│   │   │
│   │   ├── files/
│   │   │   ├── FileBrowser.tsx    # Folder browser tree view
│   │   │   ├── FileTree.tsx       # Grouped file hierarchy
│   │   │   └── GroupHeader.tsx    # Target/binder group labels
│   │   │
│   │   ├── metrics/
│   │   │   ├── MetricsTable.tsx   # TanStack Table for metrics
│   │   │   ├── MetricsFilter.tsx  # Filter controls
│   │   │   ├── ScatterPlot.tsx    # Plotly scatter plot
│   │   │   └── MetricsImport.tsx  # CSV/JSON import dialog
│   │   │
│   │   ├── selection/
│   │   │   ├── SelectionPanel.tsx # Residue selection controls
│   │   │   ├── ColorPicker.tsx    # Color scheme selector
│   │   │   ├── InterfaceSearch.tsx # Binder contact search
│   │   │   └── TargetDesignation.tsx # Chain role dialog
│   │   │
│   │   └── comparison/
│   │       └── ComparisonPanel.tsx # Multi-structure alignment
│   │
│   ├── stores/
│   │   ├── protein-store.ts       # Currently loaded protein state
│   │   ├── selection-store.ts     # Selected residues, color scheme
│   │   ├── metrics-store.ts       # Metrics data & filter state
│   │   ├── file-store.ts          # File list, groups, active file
│   │   └── ui-store.ts            # Theme, panel sizes, UI prefs
│   │
│   ├── lib/
│   │   ├── parsers/
│   │   │   └── structure-parser.ts # PDB/CIF parsing (or use Mol* built-in)
│   │   ├── metrics/
│   │   │   ├── sasa.ts            # RASA calculation
│   │   │   ├── interface.ts       # KD-tree interface detection
│   │   │   └── calculations.ts    # pLDDT, B-factor extraction
│   │   ├── grouping/
│   │   │   ├── sequence-hash.ts   # Sequence hashing
│   │   │   └── grouping-manager.ts # Target/binder grouping logic
│   │   └── constants/              # All values in 07-reference-data.md §1-3,7
│   │       ├── amino-acids.ts     # MAX_ASA, hydrophobicity, 3-to-1 codes
│   │       └── colors.ts          # Chain colors, SS colors, themes
│   │
│   ├── workers/
│   │   ├── sasa-worker.ts         # Web Worker for SASA computation
│   │   ├── interface-worker.ts    # Web Worker for interface detection
│   │   └── grouping-worker.ts     # Web Worker for batch grouping
│   │
│   ├── types/                      # Full type definitions in 07-reference-data.md §8
│   │   ├── protein.ts             # Protein, Residue, Chain types
│   │   ├── metrics.ts             # MetricResult, MetricsStore types
│   │   └── groups.ts              # StructureGroup, TargetDesignation types
│   │
│   └── styles/
│       ├── globals.css            # Tailwind base + custom vars
│       └── molstar-overrides.css  # Mol* theme customization
│
├── public/
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
├── electron-builder.yml         # Packaging config
└── components.json              # shadcn/ui config
```

---

## Key Architectural Decisions

### 1. Electron Main Process — File System Only

The Electron main process handles **only** native OS operations:
- Open folder dialog → returns list of file paths
- Read file contents → returns ArrayBuffer/string
- Save file dialog + write → for CSV/JSON export
- Watch folder for changes → file added/removed notifications

All other logic runs in the renderer (React). This keeps the architecture close to a pure web app and makes a future Tauri migration straightforward.

### 2. Mol* Plugin Lifecycle

```typescript
// Hook-based Mol* management
function useMolstar(containerRef: RefObject<HTMLDivElement>) {
  const [plugin, setPlugin] = useState<PluginUIContext | null>(null);

  useEffect(() => {
    const init = async () => {
      const p = await createPluginUI({
        target: containerRef.current!,
        render: renderReact18,
        spec: { /* custom spec */ },
      });
      setPlugin(p);
    };
    init();
    return () => plugin?.dispose();
  }, []);

  return plugin;
}
```

The Mol* plugin instance is managed via a React hook. All viewer operations (load structure, change style, select residues) go through the Mol* plugin API rather than direct DOM/WebGL manipulation.

### 3. State Management with Zustand

Five focused stores instead of one monolithic store:

```typescript
// protein-store.ts — current protein state
interface ProteinStore {
  currentProtein: ProteinData | null;
  loadedProteins: Map<string, ProteinData>;
  loadProtein: (filePath: string) => Promise<void>;
  unloadProtein: (filePath: string) => void;
}

// selection-store.ts — selection and visualization
interface SelectionStore {
  selectedResidues: Set<string>; // "chainId:resId" keys
  colorScheme: ColorSchemeName;
  viewerStyle: ViewerStyle;
  selectionColor: string;
  toggleResidue: (chainId: string, resId: number) => void;
  selectRange: (start: number, end: number, chain?: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  invertSelection: () => void;
}

// metrics-store.ts — metrics data and filters
interface MetricsStore {
  proteinMetrics: Map<string, ProteinMetrics>;
  filters: MetricFilter[];
  nameFilter: string;
  importMetrics: (file: File, format: 'csv' | 'json') => Promise<void>;
  exportMetrics: (format: 'csv' | 'json') => void;
  setFilter: (metric: string, min: number, max: number) => void;
}
```

### 4. Web Workers for Heavy Computation

Operations that currently use scipy/numpy in Python will run in Web Workers to avoid blocking the UI:

- **SASA calculation**: Port the biotite SASA algorithm or use a simpler approximation
- **KD-tree interface detection**: Use `kd-tree-javascript` npm package
- **Sequence hashing and grouping**: Batch hash computation across many structures
- **Batch metrics**: Process multiple proteins in parallel workers

### 5. Mol* Replaces Several Custom Components

Features that Mol* provides out of the box (no need to reimplement):
- 3D rendering with all representation styles
- Sequence viewer with structure mapping
- Residue selection (click, range, chain)
- Color schemes (spectrum, chain, secondary structure, B-factor)
- Structure superposition and RMSD
- Measurement tools (distances, angles)
- Annotation system
- State snapshots

Features that still need custom implementation:
- File browser / folder management
- Metrics table with filtering
- Scatter plot
- Binder contact search with match modes
- Hierarchical grouping (target/binder)
- Custom metrics import/export

---

## Communication Patterns

### Electron IPC

Full API surface with TypeScript types is in `07-reference-data.md` §9. Summary:

```typescript
// preload.ts — exposed to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path: string, data: string) => ipcRenderer.invoke('fs:writeFile', path, data),
  listFiles: (dir: string, extensions: string[]) => ipcRenderer.invoke('fs:listFiles', dir, extensions),
  watchFolder: (dir: string, callback: (event: string, path: string) => void) => { ... },
});
```

### Mol* ↔ React Communication

```typescript
// Load a structure
await plugin.builders.data.download({ url: `file://${filePath}` });
await plugin.builders.structure.parseTrajectory();

// Change representation
plugin.managers.structure.component.updateRepresentationsTheme(/* ... */);

// Listen for selection changes
plugin.behaviors.interaction.click.subscribe(event => {
  // Update React selection state
  selectionStore.toggleResidue(event.chainId, event.resId);
});
```

### Store ↔ Component Communication

Zustand stores are consumed directly in components:

```typescript
function MetricsTable() {
  const { proteinMetrics, filters, setFilter } = useMetricsStore();
  const { loadProtein } = useProteinStore();
  // ... render table
}
```

---

## Performance Considerations

### Structure Loading
- Mol* handles structure parsing natively (no need for separate parser)
- Large structures (>10k residues) render efficiently with Mol*'s WebGL renderer
- Lazy loading preserved — only parse when user selects a file

### Metrics Computation
- Web Workers for SASA, interface detection, batch operations
- SharedArrayBuffer for zero-copy data transfer to workers (where supported)
- Progressive computation with progress callbacks

### Table Performance
- TanStack Table with virtualization for 10,000+ rows
- Debounced filter inputs
- Memoized row rendering

### Memory Management
- Unload proteins not currently viewed (keep metrics in store)
- Mol* handles its own GPU memory management
- IndexedDB for persistent caching (replaces .seqhash.json files)
