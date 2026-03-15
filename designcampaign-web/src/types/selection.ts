export type SelectionKey = string  // Format: "chainId:resId" (e.g., "A:42")

export interface SelectionState {
  selectedResidues: Set<SelectionKey>
  selectionColor: string    // Hex color for selection highlight
  colorScheme: string       // Current color scheme name
  viewerStyle: string       // Current representation style
}

export type MatchMode = 'any' | 'all' | 'count' | 'percentage'

export interface InterfaceSearchParams {
  targetResidues: Array<{ chain: string; resId: number }>
  distanceCutoff: number
  matchMode: MatchMode
  matchValue?: number  // For 'count' or 'percentage' modes
}
