# Reference Data: Constants, Algorithms, Data Formats & Config Schemas

This document contains all reference data, constants, algorithm pseudocode, and data format specifications extracted from the Python source. It is fully self-contained — no access to the Python codebase is needed.

---

## 1. Amino Acid Reference Tables

### 1.1 Three-Letter to One-Letter Code Mapping

```typescript
const THREE_TO_ONE: Record<string, string> = {
  ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C',
  GLN: 'Q', GLU: 'E', GLY: 'G', HIS: 'H', ILE: 'I',
  LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P',
  SER: 'S', THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V',
  // Non-standard but common
  MSE: 'M',  // Selenomethionine
  SEC: 'U',  // Selenocysteine
  PYL: 'O',  // Pyrrolysine
};
```

### 1.2 Maximum Accessible Surface Area (Tien et al. 2013)

Used for RASA (Relative Accessible Surface Area) normalization. Units: Å².

```typescript
const MAX_ASA: Record<string, number> = {
  ALA: 129.0, ARG: 274.0, ASN: 195.0, ASP: 193.0, CYS: 167.0,
  GLN: 225.0, GLU: 223.0, GLY: 104.0, HIS: 224.0, ILE: 197.0,
  LEU: 201.0, LYS: 236.0, MET: 224.0, PHE: 240.0, PRO: 159.0,
  SER: 155.0, THR: 172.0, TRP: 285.0, TYR: 263.0, VAL: 174.0,
};
```

### 1.3 Kyte-Doolittle Hydrophobicity Scale

Range: -4.5 (most hydrophilic, ARG) to +4.5 (most hydrophobic, ILE).

```typescript
const HYDROPHOBICITY: Record<string, number> = {
  ALA:  1.8, ARG: -4.5, ASN: -3.5, ASP: -3.5, CYS:  2.5,
  GLN: -3.5, GLU: -3.5, GLY: -0.4, HIS: -3.2, ILE:  4.5,
  LEU:  3.8, LYS: -3.9, MET:  1.9, PHE:  2.8, PRO: -1.6,
  SER: -0.8, THR: -0.7, TRP: -0.9, TYR: -1.3, VAL:  4.2,
};
```

---

## 2. Color Constants

### 2.1 Chain Colors (10 rotating colors for multi-chain display)

```typescript
const CHAIN_COLORS = [
  '#1f77b4',  // blue
  '#ff7f0e',  // orange
  '#2ca02c',  // green
  '#d62728',  // red
  '#9467bd',  // purple
  '#8c564b',  // brown
  '#e377c2',  // pink
  '#7f7f7f',  // gray
  '#bcbd22',  // olive
  '#17becf',  // cyan
];
```

### 2.2 Secondary Structure Colors (ssJmol scheme)

```typescript
const SECONDARY_STRUCTURE_COLORS = {
  helix: '#ff0080',   // magenta/hot pink
  sheet: '#ffc800',   // golden yellow
  coil:  '#ffffff',    // white
};
```

### 2.3 pLDDT Confidence Thresholds (AlphaFold)

```typescript
const PLDDT_THRESHOLDS = {
  very_high: 90,   // Very high confidence (blue)
  confident: 70,   // Confident (cyan)
  low:       50,   // Low confidence (yellow)
  very_low:   0,   // Very low confidence (orange)
};
```

### 2.4 Theme Colors

**Light Theme:**
```typescript
const LIGHT_THEME = {
  background:           '#ffffff',
  foreground:           '#000000',
  secondaryBackground:  '#f5f5f5',
  border:               '#cccccc',
  plotBackground:       '#ffffff',
  plotForeground:       '#000000',
  plotGrid:             '#e0e0e0',
  tableAlternateRow:    '#f8f8f8',
  tableHeaderBackground:'#e8e8e8',
  accent:               '#0078d4',
  accentHover:          '#106ebe',
  textPrimary:          '#000000',
  textSecondary:        '#666666',
  textDisabled:         '#999999',
  viewerBackground:     '#ffffff',
};
```

**Dark Theme:**
```typescript
const DARK_THEME = {
  background:           '#1e1e1e',
  foreground:           '#d4d4d4',
  secondaryBackground:  '#252526',
  border:               '#3c3c3c',
  plotBackground:       '#252526',
  plotForeground:       '#d4d4d4',
  plotGrid:             '#3c3c3c',
  tableAlternateRow:    '#2d2d2d',
  tableHeaderBackground:'#333333',
  accent:               '#0078d4',
  accentHover:          '#1c97ea',
  textPrimary:          '#d4d4d4',
  textSecondary:        '#9d9d9d',
  textDisabled:         '#6d6d6d',
  viewerBackground:     '#1e1e1e',
};
```

---

## 3. Color Scheme Implementations

### 3.1 Color Gradient Functions

All color schemes that use gradients (B-factor, hydrophobicity, metric) need these gradient functions:

```typescript
/**
 * Interpolate between two colors.
 * @param t - Value between 0 and 1
 * @param c1 - Start color as [r, g, b] (0-255)
 * @param c2 - End color as [r, g, b] (0-255)
 */
function lerpColor(t: number, c1: [number, number, number], c2: [number, number, number]): string {
  const r = Math.round(c1[0] + (c2[0] - c1[0]) * t);
  const g = Math.round(c1[1] + (c2[1] - c1[1]) * t);
  const b = Math.round(c1[2] + (c2[2] - c1[2]) * t);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Red-White-Blue gradient. 0 = blue, 0.5 = white, 1 = red.
 */
function gradientRWB(norm: number): string {
  if (norm < 0.5) {
    const t = norm * 2;
    return lerpColor(t, [0, 0, 255], [255, 255, 255]);
  } else {
    const t = (norm - 0.5) * 2;
    return lerpColor(t, [255, 255, 255], [255, 0, 0]);
  }
}

/**
 * Blue-White-Red gradient (reverse of RWB). 0 = red, 0.5 = white, 1 = blue.
 */
function gradientBWR(norm: number): string {
  if (norm < 0.5) {
    const t = norm * 2;
    return lerpColor(t, [255, 0, 0], [255, 255, 255]);
  } else {
    const t = (norm - 0.5) * 2;
    return lerpColor(t, [255, 255, 255], [0, 0, 255]);
  }
}

/**
 * Simplified viridis-like gradient. Purple → Teal → Yellow.
 */
function gradientViridis(norm: number): string {
  if (norm < 0.5) {
    const t = norm * 2;
    return lerpColor(t, [68, 1, 84], [32, 145, 140]);
  } else {
    const t = (norm - 0.5) * 2;
    return lerpColor(t, [32, 145, 140], [253, 231, 37]);
  }
}
```

### 3.2 Color Scheme Definitions

| Scheme | Key | Gradient/Method | Legend |
|--------|-----|-----------------|-------|
| Spectrum | `spectrum` | N→C terminus rainbow | Blue → Green → Red |
| Chain | `chain` | Per-chain from `CHAIN_COLORS` array | Chain A: blue, Chain B: orange, ... |
| Secondary Structure | `secondary_structure` | Fixed per SS type | Helix: #ff0080, Sheet: #ffc800, Coil: #ffffff |
| B-Factor | `b_factor` | RWB gradient, range [0, 100] | Low (blue) → Medium (white) → High (red) |
| Hydrophobicity | `hydrophobicity` | Blue→Red, range [-4.5, +4.5] | Hydrophilic (blue) → Hydrophobic (red) |
| Metric | `metric` | Configurable gradient (rwb/bwr/viridis), configurable min/max | Low → Medium → High |
| Custom | `custom` | Per-residue color map | User-defined |

---

## 4. Algorithm Specifications

### 4.1 Interface Detection (KD-Tree)

**Purpose:** Identify residues at the interface between two protein chains.

**Algorithm:**
```
Input: structure (atom array), binder_chain (string), target_chains (string[]), distance_cutoff (float, default 4.0 Å)
Output: Map<residue_id, amino_acid_code>

1. Filter structure to amino acid atoms only
2. Extract binder atoms: atoms where chain_id == binder_chain
3. Extract target atoms: atoms where chain_id is in target_chains
4. If either set is empty, return empty map
5. Build KD-tree from binder atom coordinates
6. Build KD-tree from target atom coordinates
7. Query: binder_tree.query_ball_tree(target_tree, distance_cutoff)
   - Returns: for each binder atom, list of target atoms within cutoff
8. For each binder atom with non-empty contact list:
   - Add its residue_id → one_letter_code to result map
9. Return result map (unique residues only)
```

**Performance:** O(n log n) via KD-tree vs O(n×m) brute force.

**Contact Counting Variant:**
Same algorithm but step 8 counts contacts per residue instead of just recording presence:
```
contact_counts[residue_id] += len(close_indices)
```

**Bidirectional Interface:**
Run the algorithm twice, swapping binder and target roles, to get interface residues on both sides.

### 4.2 RASA Calculation (Shrake-Rupley Algorithm)

**Purpose:** Calculate Relative Accessible Surface Area per residue.

**Algorithm:**
```
Input: structure (atom array)
Output: Map<residue_id, rasa_value> where rasa ∈ [0.0, 1.0]

1. Filter to amino acid atoms only
2. Calculate absolute SASA per atom using Shrake-Rupley:
   a. For each atom, generate N test points on a sphere of radius (vdw_radius + probe_radius)
   b. For each test point, check if it overlaps with any neighboring atom's sphere
   c. SASA for atom = (fraction of non-overlapping points) × (sphere surface area)
   d. probe_radius = 1.4 Å (water molecule radius)
   e. N = 92 points (typical, using golden spiral distribution)
3. Aggregate atom SASA by residue: sum all atom SASA values per residue_id
4. Normalize: RASA = residue_SASA / MAX_ASA[residue_name]
5. Clamp to [0.0, 1.0]
6. Return map

Note: The current Python app uses biotite.sasa() which is a C extension implementing
Shrake-Rupley. The TypeScript port should implement the same algorithm. Consider using
a Web Worker for structures with >5000 atoms.
```

**Van der Waals Radii (Å):** Use standard Bondi radii:
```typescript
const VDW_RADII: Record<string, number> = {
  C: 1.70, N: 1.55, O: 1.52, S: 1.80, H: 1.20, P: 1.80, SE: 1.90,
};
```

### 4.3 pLDDT Extraction

**Purpose:** Extract AlphaFold confidence scores from B-factor column.

**Algorithm:**
```
Input: structure (atom array with B-factor data)
Output: Map<residue_id, plddt_value> where plddt ∈ [0, 100]

1. Check if B-factor data is available in the structure
2. Filter to amino acid atoms only
3. Select only CA (alpha carbon) atoms — one per residue
4. For each CA atom: plddt[residue_id] = b_factor value
5. Return map

Note: AlphaFold stores pLDDT in the B-factor column. Non-AlphaFold structures
will have actual B-factors here, which will still be displayed but labeled differently.
```

### 4.4 B-Factor Extraction

**Algorithm:**
```
Input: structure (atom array with B-factor data)
Output: Map<residue_id, avg_bfactor>

1. Check if B-factor data is available
2. Filter to amino acid atoms only
3. For each atom, accumulate: residue_bfactors[residue_id].push(b_factor)
4. Average: bfactor[residue_id] = mean(residue_bfactors[residue_id])
5. Return map
```

### 4.5 Sequence Hashing & Grouping

**Purpose:** Group proteins by shared sequence composition.

**Sequence Hash Algorithm:**
```
Input: protein structure
Output: hash string

1. Get all chain IDs, sorted alphabetically
2. For each chain, extract the one-letter amino acid sequence
3. Concatenate all chain sequences with chain ID separators: "A:MKTAY...;B:GDEF..."
4. Compute MD5 hash of the concatenated string
5. Return first 12 hex characters of the hash
```

**Per-Chain Hash (for target detection):**
```
Same as above but hash each chain's sequence independently.
Return: Map<chain_id, hash_12chars>
```

**Grouping:**
```
Level 1 — Sequence Groups: Group proteins by full sequence hash (all chains concatenated)
Level 2 — Target Groups: Group by target chain(s) sequence hash only
Level 3 — Binder Sub-Groups: Within a target group, sub-group by binder chain sequence hash
```

### 4.6 Auto-Detect Target/Binder Chains

**Purpose:** Heuristically determine which chains are targets vs binders across a set of structures.

**Algorithm:**
```
Input: list of (file_path, protein) tuples, min_frequency (default 0.5)
Output: Map<file_path, {target_chains, binder_chains}>

1. For each protein, compute per-chain sequence hash
2. Build occurrence map: hash → list of (file_path, chain_id) pairs
3. Count unique structures per hash
4. threshold = max(2, floor(total_structures × min_frequency))
5. Target hashes = hashes appearing in >= threshold structures
6. For each structure:
   a. target_chains = chains whose hash is in target_hashes
   b. binder_chains = all other chains
   c. If both non-empty, create designation
7. Return designations
```

### 4.7 Binder Contact Search

**Purpose:** Find structures whose binder chains contact specific target residues.

**Algorithm:**
```
Input:
  - target_residues: list of (chain_id, residue_id) tuples
  - distance_cutoff: float (default 4.0 Å)
  - min_target_contacts: int (minimum distinct target residues contacted)

Output: list of (file_path, contacting_binder_residue_ids[], target_residues_contacted_count)

For each protein:
  1. Determine target/binder chains (from designation or inferred from query)
  2. For each target residue in the query:
     a. Extract all atoms for that specific residue
     b. Build KD-tree for those atoms
  3. Get all binder chain atoms, build KD-tree
  4. For each target residue's KD-tree:
     a. Query against binder tree with distance_cutoff
     b. If any contact exists, mark this target residue as "contacted"
  5. If contacted_count < min_target_contacts, skip this protein
  6. Combine all target atom coordinates, build combined KD-tree
  7. Query binder tree against combined target tree
  8. Collect unique binder residue IDs with contacts
  9. Add to results: (file_path, sorted_binder_residues, contacted_count)

Sort results by: contacted_count DESC, then binder_residue_count DESC
```

**Match Modes (applied by the UI):**
- **Any:** min_target_contacts = 1
- **All:** min_target_contacts = len(target_residues)
- **Count:** min_target_contacts = user-specified N
- **Percentage:** min_target_contacts = ceil(len(target_residues) × user_percentage / 100)

### 4.8 Structure Alignment (CA Superposition)

**Algorithm:**
```
Input: fixed_structure, mobile_structure, chain_id
Output: (aligned_structure, rmsd)

1. Extract CA atoms from fixed_structure for chain_id → fixed_CAs
2. Extract CA atoms from mobile_structure for chain_id → mobile_CAs
3. Assert len(fixed_CAs) == len(mobile_CAs)
4. Compute optimal rotation + translation to minimize RMSD:
   - Kabsch algorithm (SVD-based):
     a. Center both point sets (subtract centroids)
     b. Compute cross-covariance matrix H = centered_mobile^T × centered_fixed
     c. SVD: H = U × S × V^T
     d. Rotation R = V × U^T (with sign correction for reflections)
     e. Translation t = centroid_fixed - R × centroid_mobile
5. Apply transformation to entire mobile_structure: new_coords = R × coords + t
6. Compute RMSD on the CA atoms only:
   rmsd = sqrt(mean(sum_i((fixed_CA_i - aligned_CA_i)²)))
7. Return (transformed mobile_structure, rmsd)

Note: Mol* has built-in MinimizeRmsd which implements this.
```

---

## 5. Data Format Specifications

### 5.1 Supported Structure File Formats

| Extension | Format | Parser |
|-----------|--------|--------|
| `.pdb` | Protein Data Bank | Mol* built-in PDB parser |
| `.cif` | macromolecular Crystallographic Information File | Mol* built-in mmCIF parser |

### 5.2 CSV Metrics Import Format

```
protein_name,metric1,metric2,metric3
protein_A,0.85,92.3,15.2
protein_B,0.72,88.1,22.7
protein_C,,95.0,18.3
```

- **First column:** protein name (matched to filename stem)
- **Header row:** required, first row is column names
- **Subsequent columns:** metric values (float)
- **Empty cells:** allowed (metric not available for that protein)

### 5.3 JSON Metrics Import Formats

**Format A — Multi-protein file:**
```json
{
  "proteins": [
    {
      "name": "protein_A",
      "file_path": "/path/to/protein_A.pdb",
      "metrics": {
        "rasa_mean": 0.45,
        "plddt_mean": 85.2,
        "pdockq": 0.72
      }
    }
  ]
}
```

**Format B — Simple array:**
```json
[
  {"name": "protein_A", "metrics": {"rasa_mean": 0.45}},
  {"name": "protein_B", "metrics": {"rasa_mean": 0.52}}
]
```

**Format C — Single-protein JSON (auto-scanned):**

For per-protein JSON files (e.g., AlphaFold output), the app recursively scans the JSON for numeric values:

```json
{
  "name": "complex_prediction",
  "pdockq": 0.72,
  "pdockq2": 0.68,
  "iptm": 0.85,
  "ptm": 0.90,
  "pae": [[1.2, 3.5, ...], ...],
  "complex_pae_scores": [
    {"chain1": "A", "chain2": "B", "pae": 5.2, "contact_count": 45},
    {"chain1": "A", "chain2": "C", "pae": 12.1, "contact_count": 12}
  ]
}
```

**Scanning rules:**
- Scalar int/float → stored directly as metric (key = JSON path, e.g., `"pdockq"`)
- List of numbers → stored as `{key}_mean`, `{key}_min`, `{key}_max`
- List of dicts → extract using chain-pair labels (e.g., `"A_B.pae"`)
- Maximum scan depth: 4 levels
- Skip keys: `name`, `sequence_name`, `job_id`, `file_path`, `version`, `date`
- Protein name resolved from: `sequence_name` → `job_id` → `name` → filename stem

### 5.4 CSV/JSON Metrics Export Format

**CSV export:**
```
name,metric1,metric2
protein_A,0.8500,92.3000
protein_B,0.7200,88.1000
```
- Sorted by protein name
- 4 decimal places for metric values
- Empty string for missing values

**JSON export:**
```json
{
  "proteins": [
    {"name": "protein_A", "file_path": null, "metrics": {"metric1": 0.85, "metric2": 92.3}},
    {"name": "protein_B", "file_path": null, "metrics": {"metric1": 0.72, "metric2": 88.1}}
  ]
}
```

### 5.5 FASTA Export (Selected Residues)

```
>protein_A chain_A residues 10-25,30-45
MKTAYIAKQRQISFV...
>protein_A chain_B residues 1-12
GDEFHIKLMNPQ
```

---

## 6. User Configuration Schema

### 6.1 Full Config (stored in localStorage for web app)

```typescript
interface UserConfig {
  filters: {
    metric_ranges: Record<string, [number | null, number | null]>;
    // e.g., { "rasa": [0.2, 0.8], "plddt": [50, null] }
  };
  viewer: {
    cell_size: 'small' | 'medium' | 'large';  // Sequence viewer cell size
    color_scheme: string;                       // Default: 'spectrum'
    representation: string;                     // Default: 'cartoon'
    interface_cutoff: number;                   // Default: 4.0
    dark_mode: boolean;                         // Default: false
    collapsed_sections: Record<string, boolean>; // Panel section states
    hidden_columns: string[];                   // Hidden metric table columns
  };
  last_folder: string | null;
  window_geometry: {
    x: number;
    y: number;
    width: number;   // Default: 1200
    height: number;  // Default: 800
  } | null;
}
```

### 6.2 Default Values

```typescript
const DEFAULT_CONFIG: UserConfig = {
  filters: { metric_ranges: {} },
  viewer: {
    cell_size: 'large',
    color_scheme: 'spectrum',
    representation: 'cartoon',
    interface_cutoff: 4.0,
    dark_mode: false,
    collapsed_sections: {},
    hidden_columns: [],
  },
  last_folder: null,
  window_geometry: null,
};
```

---

## 7. Application Defaults

```typescript
const APP_DEFAULTS = {
  SUPPORTED_FORMATS: ['.pdb', '.cif'],
  DEFAULT_WINDOW_WIDTH: 1200,
  DEFAULT_WINDOW_HEIGHT: 800,
  LEFT_PANEL_RATIO: 0.25,
  DEFAULT_VIEWER_STYLE: 'cartoon',
  DEFAULT_BACKGROUND_COLOR: '#ffffff',
  MAX_FILE_SIZE_WARNING: 100 * 1024 * 1024,  // 100 MB
  DEFAULT_INTERFACE_CUTOFF: 4.0,              // Angstroms
  MAX_COMPARISON_STRUCTURES: 4,               // Primary + 3 comparison
  SEQUENCE_HASH_LENGTH: 12,                   // First 12 hex chars of MD5
  CACHE_VERSION: 1,
};
```

---

## 8. Type Definitions

These TypeScript types should be created in `src/types/`:

### 8.1 Protein Types (`protein.ts`)

```typescript
interface Residue {
  id: number;
  name: string;       // Three-letter code (e.g., "ALA")
  oneLetter: string;  // Single-letter code (e.g., "A")
  chain: string;      // Chain ID (e.g., "A")
}

interface ProteinData {
  filePath: string;
  fileName: string;
  format: 'pdb' | 'mmcif';
  chains: string[];
  residues: Residue[];
  secondaryStructure: Map<string, 'helix' | 'sheet' | 'coil'>; // "chainId:resId" → type
}
```

### 8.2 Metrics Types (`metrics.ts`)

```typescript
interface MetricResult {
  name: string;
  description: string;
  values: Map<string, number>;  // "chainId:resId" → value
  minValue: number;
  maxValue: number;
  unit?: string;
}

interface ProteinMetrics {
  name: string;
  filePath?: string;
  metrics: Record<string, number>;  // metric_name → aggregate value
}
```

### 8.3 Grouping Types (`groups.ts`)

```typescript
interface StructureGroup {
  id: string;         // UUID for custom groups, hash for sequence groups
  name: string;
  groupType: 'sequence' | 'target' | 'custom';
  key: string;        // Sequence hash or custom key
  members: string[];  // File paths
  metadata: Record<string, unknown>;
  isCustom: boolean;
}

interface TargetDesignation {
  filePath: string;
  targetChains: string[];
  binderChains: string[];
}

interface SequenceHashCache {
  filePath: string;
  mtime: number;      // File modification time (ms since epoch)
  hashKey: string;     // 12-char hex hash
  chains: string[];
  numResidues: number;
  sequencePreview: string;  // First 30 characters
  version: number;
}

interface BinderSearchResult {
  filePath: string;
  contactingResidues: number[];  // Binder residue IDs with contacts
  targetResiduesContacted: number;  // Count of distinct target residues contacted
}
```

### 8.4 Selection Types

```typescript
type SelectionKey = string;  // Format: "chainId:resId" (e.g., "A:42")

interface SelectionState {
  selectedResidues: Set<SelectionKey>;
  selectionColor: string;     // Hex color for selection highlight
  colorScheme: string;        // Current color scheme name
  viewerStyle: string;        // Current representation style
}

type MatchMode = 'any' | 'all' | 'count' | 'percentage';

interface InterfaceSearchParams {
  targetResidues: Array<{ chain: string; resId: number }>;
  distanceCutoff: number;
  matchMode: MatchMode;
  matchValue?: number;  // For 'count' or 'percentage' modes
}
```

---

## 9. Electron IPC API Surface

The preload script should expose these functions to the renderer process:

```typescript
interface ElectronAPI {
  // Dialogs
  openFolder(): Promise<string | null>;           // Returns folder path or null if cancelled
  saveFileDialog(defaultName: string, filters: FileFilter[]): Promise<string | null>;

  // File system
  readFile(path: string): Promise<string>;         // Read file as UTF-8 string
  readFileBinary(path: string): Promise<ArrayBuffer>; // For binary formats
  writeFile(path: string, data: string): Promise<void>;
  listFiles(dir: string, extensions: string[]): Promise<FileInfo[]>;
  getFileStats(path: string): Promise<{ size: number; mtime: number }>;

  // Folder watching
  watchFolder(dir: string, callback: (event: string, path: string) => void): () => void;
}

interface FileInfo {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

interface FileFilter {
  name: string;
  extensions: string[];
}
```
