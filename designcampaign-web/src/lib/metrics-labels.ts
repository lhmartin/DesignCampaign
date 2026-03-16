/** Human-readable labels for built-in metric columns. */
export const BUILTIN_LABELS: Record<string, string> = {
  mean_plddt:   'pLDDT',
  mean_bfactor: 'B-factor',
  num_residues: 'Residues',
  chain_count:  'Chains',
  rank_score:   'Rank Score',
}

/** Short display label for a column key. */
export function shortLabel(col: string): string {
  return BUILTIN_LABELS[col] ?? col.split('.').pop() ?? col
}
