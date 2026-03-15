export interface Residue {
  id: number
  name: string       // Three-letter code (e.g., "ALA")
  oneLetter: string  // Single-letter code (e.g., "A")
  chain: string      // Chain ID (e.g., "A")
}

export interface ProteinData {
  filePath: string
  fileName: string
  format: 'pdb' | 'mmcif'
  chains: string[]
  residues: Residue[]
  secondaryStructure: Map<string, 'helix' | 'sheet' | 'coil'> // "chainId:resId" → type
}
