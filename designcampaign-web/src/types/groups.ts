export interface StructureGroup {
  id: string           // UUID for custom groups, hash for sequence groups
  name: string
  groupType: 'sequence' | 'target' | 'custom'
  key: string          // Sequence hash or custom key
  members: string[]    // File paths
  metadata: Record<string, unknown>
  isCustom: boolean
}

export interface TargetDesignation {
  filePath: string
  targetChains: string[]
  binderChains: string[]
}

export interface SequenceHashCache {
  filePath: string
  mtime: number          // File modification time (ms since epoch)
  hashKey: string        // 12-char hex hash
  chains: string[]
  numResidues: number
  sequencePreview: string  // First 30 characters
  version: number
}

export interface BinderSearchResult {
  filePath: string
  contactingResidues: number[]      // Binder residue IDs with contacts
  targetResiduesContacted: number   // Count of distinct target residues contacted
}
