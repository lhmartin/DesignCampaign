# Mol* Integration Guide: py3Dmol → Mol* API Mapping

This document provides the specific API mappings and code patterns needed to replace every py3Dmol operation with Mol* equivalents. It is structured as a reference for implementation.

---

## 1. Plugin Initialization

### Current (py3Dmol in QWebEngineView)

```javascript
// Embedded in HTML template (viewer.py lines 95-105)
var viewer = $3Dmol.createViewer("viewer-container", {
    backgroundColor: "white",
    antialias: true
});
viewer.setClickable({}, true, function(atom) { /* ... */ });
viewer.setHoverable({}, true, enterFunc, leaveFunc);
```

### Mol* Equivalent

```typescript
import { createPluginUI } from 'molstar/mol-plugin-ui';
import { renderReact18 } from 'molstar/mol-plugin-ui/react18';
import { DefaultPluginUISpec } from 'molstar/mol-plugin-ui/spec';

const plugin = await createPluginUI({
  target: containerElement,
  render: renderReact18,
  spec: {
    ...DefaultPluginUISpec(),
    layout: {
      initial: {
        showControls: false,    // Hide Mol* built-in controls (we build our own)
        regionState: {
          top: 'hidden',
          left: 'hidden',
          right: 'hidden',
          bottom: 'hidden',
        }
      }
    },
    canvas3d: {
      renderer: {
        backgroundColor: 0xFFFFFF,  // White background
      }
    }
  }
});
```

### React Hook Pattern

```typescript
function useMolstar(containerRef: React.RefObject<HTMLDivElement>) {
  const [plugin, setPlugin] = useState<PluginUIContext | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    let disposed = false;

    const init = async () => {
      const p = await createPluginUI({
        target: containerRef.current!,
        render: renderReact18,
        spec: { /* as above */ }
      });
      if (!disposed) setPlugin(p);
    };
    init();

    return () => {
      disposed = true;
      plugin?.dispose();
    };
  }, []);

  return plugin;
}
```

---

## 2. Structure Loading

### Current (py3Dmol)

```javascript
// viewer.py line 122
viewer.addModel(pdbData, "pdb");  // or "cif"
viewer.setStyle({}, {cartoon: {}});
viewer.zoomTo();
viewer.render();
```

```python
# Python side: reads file, sends string to JS
file_content = read_protein_file(file_path)
self._run_js(f"loadStructure({json.dumps(file_content)}, '{fmt}');")
```

### Mol* Equivalent

```typescript
// Load from file contents (string)
async function loadStructure(plugin: PluginUIContext, data: string, format: 'pdb' | 'mmcif') {
  // Clear existing structures
  await plugin.clear();

  const molData = await plugin.builders.data.rawData({
    data,
    label: filename,
  });

  const trajectory = await plugin.builders.structure.parseTrajectory(molData, format);

  await plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default', {
    structure: { },
    showUnitcell: false,
    representationPreset: 'auto',
  });
}

// Or load from file path via Electron IPC
async function loadFromFile(plugin: PluginUIContext, filePath: string) {
  const content = await window.electronAPI.readFile(filePath);
  const format = filePath.endsWith('.cif') ? 'mmcif' : 'pdb';
  await loadStructure(plugin, content, format);
}
```

---

## 3. Representation Styles

### Current (py3Dmol)

```javascript
// viewer.py lines 199-210
viewer.setStyle({}, {cartoon: {color: color}});
viewer.setStyle({}, {stick: {color: color, radius: 0.2}});
viewer.setStyle({}, {sphere: {color: color}});
viewer.setStyle({}, {line: {color: color}});
// Surface requires addSurface()
viewer.addSurface($3Dmol.SurfaceType.VDW, {opacity: 0.8, color: color});
```

### Mol* Equivalent

```typescript
import { StructureRepresentationRegistry } from 'molstar/mol-repr/structure/registry';

// Map our style names to Mol* representation types
const STYLE_MAP: Record<string, string> = {
  cartoon: 'cartoon',
  stick:   'ball-and-stick',
  sphere:  'spacefill',
  line:    'line',
  surface: 'molecular-surface',
};

async function setRepresentationStyle(
  plugin: PluginUIContext,
  style: keyof typeof STYLE_MAP
) {
  const structures = plugin.managers.structure.hierarchy.current.structures;

  for (const structureRef of structures) {
    // Remove existing representations
    const components = structureRef.components;
    for (const component of components) {
      for (const repr of component.representations) {
        await plugin.managers.structure.component.removeRepresentation(
          component, repr
        );
      }
      // Add new representation
      await plugin.managers.structure.component.addRepresentation(
        component,
        { type: STYLE_MAP[style] }
      );
    }
  }
}
```

---

## 4. Color Schemes

### 4.1 Spectrum (N→C terminus)

**Current:** `{colorscheme: 'spectrum'}`

**Mol*:**
```typescript
import { ColorTheme } from 'molstar/mol-theme/color';

// Built-in: 'sequence-id' theme provides N→C rainbow coloring
await updateColorTheme(plugin, 'sequence-id');
```

### 4.2 Chain Colors

**Current:**
```javascript
var chainColors = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd',
                   '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
// Set per-chain with addStyle({chain: 'A'}, {cartoon: {color: chainColors[i]}})
```

**Mol*:**
```typescript
// Built-in 'chain-id' theme, but with custom palette
import { Color } from 'molstar/mol-util/color';

const CHAIN_COLORS = [
  Color(0x1f77b4), Color(0xff7f0e), Color(0x2ca02c), Color(0xd62728),
  Color(0x9467bd), Color(0x8c564b), Color(0xe377c2), Color(0x7f7f7f),
  Color(0xbcbd22), Color(0x17becf),
];

// Use 'chain-id' built-in theme
await updateColorTheme(plugin, 'chain-id');

// Or for exact color matching, create custom theme provider
// (see Section 4.7 for custom theme pattern)
```

### 4.3 Secondary Structure

**Current:**
```javascript
// ssJmol scheme: helix=#ff0080, sheet=#ffc800, coil=#ffffff
{colorscheme: 'ssJmol'}
```

**Mol*:**
```typescript
// Built-in 'secondary-structure-type' theme
// Colors differ from ssJmol — override with custom theme if exact match needed
await updateColorTheme(plugin, 'secondary-structure-type');
```

### 4.4 B-Factor

**Current:**
```javascript
{colorscheme: {prop: 'b', gradient: 'rwb', min: 0, max: 100}}
```

**Mol*:**
```typescript
// Built-in 'uncertainty' theme reads B-factor/pLDDT
await updateColorTheme(plugin, 'uncertainty');

// For custom gradient, register a custom theme (see 4.7)
```

### 4.5 Hydrophobicity

**Current (viewer.py lines 233-247):**
```javascript
// Custom colorfunc with Kyte-Doolittle scale
var hydro = {'ALA': 1.8, 'ARG': -4.5, ...};
function colorfunc(atom) {
    var val = hydro[atom.resn] || 0;
    // Map [-4.5, 4.5] to blue→red gradient
    return colorFromGradient(val, -4.5, 4.5);
}
{colorfunc: colorfunc}
```

**Mol*:**
```typescript
// Must register a custom ColorTheme
import { ThemeDataContext } from 'molstar/mol-theme/theme';
import { ColorTheme } from 'molstar/mol-theme/color';
import { Color } from 'molstar/mol-util/color';

const HYDROPHOBICITY: Record<string, number> = {
  ALA: 1.8, ARG: -4.5, ASN: -3.5, ASP: -3.5, CYS: 2.5,
  GLN: -3.5, GLU: -3.5, GLY: -0.4, HIS: -3.2, ILE: 4.5,
  LEU: 3.8, LYS: -3.9, MET: 1.9, PHE: 2.8, PRO: -1.6,
  SER: -0.8, THR: -0.7, TRP: -0.9, TYR: -1.3, VAL: 4.2,
};

// Register as custom color theme (see Section 4.7 for full pattern)
function hydrophobicityColor(location: StructureElement.Location): Color {
  const compId = StructureProperties.atom.label_comp_id(location);
  const value = HYDROPHOBICITY[compId] ?? 0;
  const normalized = (value + 4.5) / 9.0; // Map [-4.5, 4.5] → [0, 1]
  return interpolateRWB(normalized); // Blue → White → Red
}
```

### 4.6 Metric Coloring (per-residue arbitrary values)

**Current:**
```javascript
// viewer.py lines 227-231
function colorfunc(atom) {
    var val = metricValues[atom.chain + ':' + atom.resi];
    return colorFromGradient(val, metricMin, metricMax);
}
```

**Mol*:**
```typescript
// Custom theme that reads from a Map<string, number>
function createMetricColorTheme(
  values: Map<string, number>,  // "chainId:resId" → value
  min: number,
  max: number,
  gradient: 'rwb' | 'bwr' | 'viridis'
): ColorTheme<any> {
  // See Section 4.7 for registration pattern
  // In the color function:
  function metricColor(location: StructureElement.Location): Color {
    const chainId = StructureProperties.chain.auth_asym_id(location);
    const resId = StructureProperties.residue.auth_seq_id(location);
    const key = `${chainId}:${resId}`;
    const value = values.get(key);
    if (value === undefined) return Color(0xCCCCCC); // Gray for missing
    const normalized = (value - min) / (max - min);
    return applyGradient(normalized, gradient);
  }
}
```

### 4.7 Custom ColorTheme Registration Pattern

```typescript
import { ColorTheme, ColorThemeProvider } from 'molstar/mol-theme/color';
import { ThemeRegistryContext } from 'molstar/mol-theme/theme';
import { StructureElement, StructureProperties } from 'molstar/mol-model/structure';
import { Color } from 'molstar/mol-util/color';
import { ParamDefinition as PD } from 'molstar/mol-util/param-definition';

// 1. Define the theme provider
const HydrophobicityColorThemeProvider: ColorThemeProvider<{}> = {
  name: 'hydrophobicity',
  label: 'Hydrophobicity',
  category: 'Custom',
  factory: (ctx, props) => {
    return {
      factory: HydrophobicityColorThemeProvider,
      granularity: 'group',  // Per-residue coloring
      color: (location: StructureElement.Location) => {
        if (!StructureElement.Location.is(location)) return Color(0xCCCCCC);
        const compId = StructureProperties.atom.label_comp_id(location);
        const value = HYDROPHOBICITY[compId] ?? 0;
        const t = (value + 4.5) / 9.0;
        return interpolateColor(t, Color(0x0000FF), Color(0xFFFFFF), Color(0xFF0000));
      },
      props,
      description: 'Kyte-Doolittle hydrophobicity scale',
    };
  },
  getParams: () => ({}),
  defaultValues: {},
  isApplicable: () => true,
};

// 2. Register the theme
plugin.representation.structure.themes.colorThemeRegistry.add(
  HydrophobicityColorThemeProvider
);

// 3. Apply to representations
async function updateColorTheme(plugin: PluginUIContext, themeName: string) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  for (const s of structures) {
    for (const c of s.components) {
      for (const r of c.representations) {
        const update = plugin.state.data.build()
          .to(r.cell)
          .update(
            old => ({
              ...old,
              colorTheme: { name: themeName }
            })
          );
        await plugin.runTask(plugin.state.data.updateTree(update));
      }
    }
  }
}
```

---

## 5. Residue Selection & Interaction

### 5.1 Click Selection

**Current:**
```javascript
// viewer.py lines 105-119
viewer.setClickable({}, true, function(atom, viewer, event, container) {
    var resKey = atom.chain + ':' + atom.resi;
    if (event.ctrlKey || event.metaKey) {
        toggleSelection(resKey);  // Add/remove from set
    } else {
        clearSelection();
        addToSelection(resKey);
    }
    updateSelectionVisuals();
    pyBridge.onSelectionChanged(JSON.stringify(selectedResidues));
});
```

**Mol*:**
```typescript
import { Binding } from 'molstar/mol-util/binding';

// Subscribe to click events
plugin.behaviors.interaction.click.subscribe(({ current, buttons, modifiers }) => {
  if (!current.loci || !StructureElement.Loci.is(current.loci)) return;

  const loci = current.loci;
  const elements = StructureElement.Loci.toStructureElementLoci(loci);

  // Extract chain and residue info
  const location = StructureElement.Location.create(elements.structure);
  for (const unit of elements.elements) {
    StructureElement.Location.set(location, elements.structure, unit.unit, unit.indices[0]);
    const chainId = StructureProperties.chain.auth_asym_id(location);
    const resId = StructureProperties.residue.auth_seq_id(location);

    if (modifiers.control) {
      selectionStore.toggleResidue(chainId, resId);
    } else {
      selectionStore.clearSelection();
      selectionStore.addResidue(chainId, resId);
    }
  }
});
```

### 5.2 Hover Highlighting

**Current:**
```javascript
viewer.setHoverable({}, true,
    function(atom) { /* highlight in cyan */ },
    function(atom) { /* remove highlight */ }
);
```

**Mol*:**
```typescript
// Mol* has built-in hover highlighting via the Interactivity manager
// Configure highlight color:
plugin.canvas3d?.setProps({
  highlight: {
    renderStyle: {
      colorBlend: Color(0x00FFFF),  // Cyan highlight
      alpha: 0.5,
    }
  }
});

// Mol* handles hover highlighting automatically when Interactivity is enabled
```

### 5.3 Selection Visualization

**Current:**
```javascript
// Apply yellow highlight to selected residues
for (var res of selectedResidues) {
    viewer.addStyle({chain: res.chain, resi: res.resi},
        {cartoon: {color: selectionColor}});
}
```

**Mol*:**
```typescript
// Use Mol*'s built-in selection manager with overpaint
import { Bundle } from 'molstar/mol-model/structure/structure/element/bundle';

async function highlightSelection(
  plugin: PluginUIContext,
  residues: Set<string>,  // "chainId:resId" keys
  color: Color
) {
  const structure = plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data;
  if (!structure) return;

  // Build a Loci from our selection set
  const loci = buildLociFromResidues(structure, residues);

  // Apply overpaint (visual overlay without changing base color scheme)
  await plugin.managers.structure.component.applyTheme(
    { color: { name: 'uniform', params: { value: color } } },
    loci
  );
}
```

### 5.4 Zoom to Selection

**Current:** `viewer.zoomTo({chain: chainId, resi: [r1, r2, ...]});`

**Mol*:**
```typescript
// Focus camera on a Loci
const loci = buildLociFromResidues(structure, selectedResidues);
plugin.managers.camera.focusLoci(loci);
```

---

## 6. Multi-Structure Overlay (Comparison)

### Current (py3Dmol)

```javascript
// Load comparison structures as additional models
viewer.addModel(compData, format);  // model index 1, 2, ...
viewer.setStyle({model: 1}, {cartoon: {opacity: 0.5, color: '#ff7f0e'}});

// Toggle visibility
viewer.setStyle({model: 1}, {cartoon: {hidden: true}});
```

### Mol* Equivalent

```typescript
// Load multiple structures — each gets its own entry in the hierarchy
async function addComparisonStructure(
  plugin: PluginUIContext,
  data: string,
  format: 'pdb' | 'mmcif',
  color: Color,
  opacity: number = 0.5
) {
  const molData = await plugin.builders.data.rawData({ data });
  const trajectory = await plugin.builders.structure.parseTrajectory(molData, format);
  const preset = await plugin.builders.structure.hierarchy.applyPreset(
    trajectory, 'default'
  );

  // Apply color and opacity to comparison structure
  // Each loaded structure is a separate entry in hierarchy.current.structures
}

// Toggle visibility
function toggleStructureVisibility(plugin: PluginUIContext, structureIndex: number) {
  const structures = plugin.managers.structure.hierarchy.current.structures;
  if (structureIndex >= structures.length) return;

  const structRef = structures[structureIndex];
  for (const component of structRef.components) {
    for (const repr of component.representations) {
      plugin.state.data.updateCellState(repr.cell.transform.ref, {
        isHidden: !repr.cell.state.isHidden
      });
    }
  }
}
```

---

## 7. Structure Superposition (Alignment)

### Current (Python/biotite)

```python
# alignment.py
from biotite.structure import superimpose
fixed_ca = fixed[fixed.atom_name == "CA"]
mobile_ca = mobile[mobile.atom_name == "CA"]
_, transform = superimpose(fixed_ca, mobile_ca)
aligned = transform.apply(mobile)
rmsd = struc.rmsd(fixed_ca, transform.apply(mobile_ca))
```

### Mol* Equivalent

```typescript
import { StructureSuperposition } from 'molstar/mol-model/structure/structure/util/superposition';
import { MinimizeRmsd } from 'molstar/mol-math/linear-algebra/3d/minimize-rmsd';

// Mol* has built-in superposition
// Use the StructureSelectionManager to select CA atoms, then apply superposition

async function alignStructures(
  plugin: PluginUIContext,
  fixedStructureIdx: number,
  mobileStructureIdx: number,
  chainId: string
): Promise<number> {
  // Get structures
  const structures = plugin.managers.structure.hierarchy.current.structures;
  const fixed = structures[fixedStructureIdx].cell.obj?.data;
  const mobile = structures[mobileStructureIdx].cell.obj?.data;
  if (!fixed || !mobile) throw new Error('Structures not loaded');

  // Select CA atoms for specified chain
  const fixedCAs = selectCAAtoms(fixed, chainId);
  const mobileCAs = selectCAAtoms(mobile, chainId);

  // Compute superposition
  const result = MinimizeRmsd.compute({
    a: fixedCAs.coordinates,
    b: mobileCAs.coordinates,
  });

  // Apply transformation to mobile structure
  const transform = result.bTransform;
  await applyTransformToStructure(plugin, mobileStructureIdx, transform);

  return result.rmsd;
}
```

---

## 8. Background Color

### Current

```javascript
viewer.setBackgroundColor(darkMode ? '#1e1e1e' : '#ffffff');
```

### Mol*

```typescript
plugin.canvas3d?.setProps({
  renderer: {
    backgroundColor: darkMode ? Color(0x1e1e1e) : Color(0xFFFFFF),
  }
});
```

---

## 9. Sequence Viewer

### Current (custom QWidget in sequence_viewer.py, 612 lines)

- Custom-built horizontal scrollable widget
- One cell per residue, single-letter code
- Chain separators, cell size options
- Click/Ctrl+Click selection synced with 3D viewer

### Mol* Equivalent

Mol* includes a built-in sequence viewer (`SequenceView` component in `mol-plugin-ui`).

```typescript
// The sequence viewer is part of Mol*'s UI layer
// When using createPluginUI, it can be enabled in the spec:
spec: {
  layout: {
    initial: {
      regionState: {
        bottom: 'full',  // Show sequence viewer at bottom
      }
    }
  }
}

// Selection sync is automatic — clicking in sequence selects in 3D and vice versa
// This replaces all 612 lines of sequence_viewer.py
```

**If more control is needed:** Extract `SequenceView` React component from `molstar/mol-plugin-ui/sequence` and embed it directly in the layout.

---

## 10. Data Extraction from Mol* Parsed Structures

### Getting Chain Information

```typescript
import { StructureProperties as SP } from 'molstar/mol-model/structure';
import { StructureElement } from 'molstar/mol-model/structure';

function getChains(structure: Structure): string[] {
  const chains = new Set<string>();
  const l = StructureElement.Location.create(structure);
  for (const unit of structure.units) {
    StructureElement.Location.set(l, structure, unit, unit.elements[0]);
    chains.add(SP.chain.auth_asym_id(l));
  }
  return Array.from(chains);
}
```

### Getting Residue Sequence

```typescript
function getSequence(structure: Structure): Array<{
  id: number;
  name: string;
  oneLetter: string;
  chain: string;
}> {
  const residues: Array<{id: number; name: string; oneLetter: string; chain: string}> = [];
  const l = StructureElement.Location.create(structure);

  // Iterate through residues
  for (const unit of structure.units) {
    const { elements } = unit;
    let prevResId = -1;
    for (let i = 0; i < elements.length; i++) {
      StructureElement.Location.set(l, structure, unit, elements[i]);
      const resId = SP.residue.auth_seq_id(l);
      if (resId === prevResId) continue; // Skip duplicate atoms in same residue
      prevResId = resId;

      residues.push({
        id: resId,
        name: SP.atom.label_comp_id(l),
        oneLetter: THREE_TO_ONE[SP.atom.label_comp_id(l)] ?? 'X',
        chain: SP.chain.auth_asym_id(l),
      });
    }
  }
  return residues;
}
```

### Extracting B-Factor / pLDDT

```typescript
function extractBFactors(structure: Structure): Map<string, number> {
  const bFactors = new Map<string, number>(); // "chainId:resId" → avg B-factor
  const l = StructureElement.Location.create(structure);

  const residueAccum = new Map<string, { sum: number; count: number }>();

  for (const unit of structure.units) {
    for (let i = 0; i < unit.elements.length; i++) {
      StructureElement.Location.set(l, structure, unit, unit.elements[i]);
      const chainId = SP.chain.auth_asym_id(l);
      const resId = SP.residue.auth_seq_id(l);
      const bFactor = SP.atom.B_iso_or_equiv(l);

      const key = `${chainId}:${resId}`;
      const accum = residueAccum.get(key) ?? { sum: 0, count: 0 };
      accum.sum += bFactor;
      accum.count += 1;
      residueAccum.set(key, accum);
    }
  }

  for (const [key, { sum, count }] of residueAccum) {
    bFactors.set(key, sum / count);
  }
  return bFactors;
}
```

### Getting Atom Coordinates (for KD-tree)

```typescript
function getAtomCoordinates(structure: Structure, chainId?: string): Float32Array {
  // Returns flat array [x1,y1,z1, x2,y2,z2, ...]
  const coords: number[] = [];
  const l = StructureElement.Location.create(structure);

  for (const unit of structure.units) {
    for (let i = 0; i < unit.elements.length; i++) {
      StructureElement.Location.set(l, structure, unit, unit.elements[i]);
      if (chainId && SP.chain.auth_asym_id(l) !== chainId) continue;

      const x = SP.atom.x(l);
      const y = SP.atom.y(l);
      const z = SP.atom.z(l);
      coords.push(x, y, z);
    }
  }
  return new Float32Array(coords);
}
```

---

## 11. Key Differences & Gotchas

| Area | py3Dmol | Mol* | Impact |
|------|---------|------|--------|
| **API style** | Imperative (`viewer.setStyle()`) | State-tree based (builders + state updates) | Steeper learning curve |
| **Model indexing** | Integer model indices (0, 1, 2...) | Structure hierarchy refs | Must track refs, not indices |
| **Color application** | `{colorscheme: name}` inline | Separate ColorTheme system with registration | More code for custom colors |
| **Selection** | `{chain: 'A', resi: 42}` selector objects | `StructureElement.Loci` objects | Different mental model |
| **Rendering** | Implicit (auto-render on change) | Explicit state tree updates | Must trigger re-render via state |
| **Sequence viewer** | Must build custom (612 lines) | Built-in component | Major code savings |
| **Superposition** | Not available (done in Python) | Built-in `MinimizeRmsd` | Can move alignment to browser |
| **Surface** | `addSurface()` call | Representation type `molecular-surface` | Simpler in Mol* |

---

## 12. Mol* npm Packages to Install

```json
{
  "dependencies": {
    "molstar": "^4.x",
    "react": "^18.x",
    "react-dom": "^18.x"
  }
}
```

Mol* bundles everything in the `molstar` package. No separate packages needed for the viewer, parsers, or UI components.

---

## 13. Mol* CSS Requirements

```css
/* Import Mol* styles in globals.css */
@import 'molstar/mol-plugin-ui/skin/light.scss';
/* or */
@import 'molstar/mol-plugin-ui/skin/dark.scss';

/* Override Mol* styles to match app theme */
.msp-plugin {
  /* Custom overrides in molstar-overrides.css */
}
```

For Tailwind integration, isolate Mol*'s styles to its container to prevent conflicts.
