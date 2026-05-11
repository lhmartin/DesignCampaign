export type Severity = 'high' | 'medium' | 'low'
export type LiabilityCategory =
  | 'deamidation'
  | 'isomerization'
  | 'glycosylation'
  | 'oxidation'
  | 'cysteine'
  | 'fragmentation'
  | 'integrin'

export interface LiabilityPreset {
  id: string
  name: string
  /** Regex string applied per-chain sequence (never to a concatenation). */
  pattern: string
  category: LiabilityCategory
  severity: Severity
  description: string
  links: { label: string; url: string }[]
}

export const LIABILITY_PRESETS: LiabilityPreset[] = [
  // ── Deamidation ─────────────────────────────────────────────────────────────
  {
    id: 'NG', name: 'Deamidation NG', pattern: 'NG',
    category: 'deamidation', severity: 'high',
    description: 'Asn-Gly: highest-risk deamidation site. Gly flexibility drives Asn→isoAsp conversion (charge −1), reducing binding affinity. Half-life of days at physiological pH.',
    links: [
      { label: 'Lundberg et al. 2019 (131 clinical mAbs)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },
  {
    id: 'NS', name: 'Deamidation NS', pattern: 'NS',
    category: 'deamidation', severity: 'high',
    description: 'Asn-Ser: second-highest deamidation risk; common CDR hotspot at CDRH2 position H54.',
    links: [
      { label: 'Lundberg et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
    ],
  },
  {
    id: 'NT', name: 'Deamidation NT', pattern: 'NT',
    category: 'deamidation', severity: 'medium',
    description: 'Asn-Thr: moderate deamidation rate; routinely flagged in CDR developability screens.',
    links: [
      { label: 'Lundberg et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
    ],
  },
  {
    id: 'NN', name: 'Deamidation NN', pattern: 'NN',
    category: 'deamidation', severity: 'medium',
    description: 'Asn-Asn: moderate deamidation; double-Asn runs compound the liability.',
    links: [
      { label: 'Lundberg et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
    ],
  },

  // ── Isomerization ────────────────────────────────────────────────────────────
  {
    id: 'DG', name: 'Isomerization DG', pattern: 'DG',
    category: 'isomerization', severity: 'high',
    description: 'Asp-Gly: highest-risk isomerization. Succinimide intermediate distorts CDR backbone and can eliminate antigen contact.',
    links: [
      { label: 'Lundberg et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },
  {
    id: 'DS', name: 'Isomerization DS', pattern: 'DS',
    category: 'isomerization', severity: 'high',
    description: 'Asp-Ser: accounts for ~50–63% of CDRH2 isomerization events in clinical mAbs.',
    links: [
      { label: 'Lundberg et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
    ],
  },
  {
    id: 'DT', name: 'Isomerization DT', pattern: 'DT',
    category: 'isomerization', severity: 'medium',
    description: 'Asp-Thr: moderate isomerization; lower modification levels than DG/DS.',
    links: [
      { label: 'Lundberg et al. 2019', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6343770/' },
    ],
  },

  // ── N-linked Glycosylation ───────────────────────────────────────────────────
  {
    id: 'NGLYC', name: 'N-Glycosylation NxS/T', pattern: 'N[^P][ST]',
    category: 'glycosylation', severity: 'high',
    description: 'N-linked glycosylation sequon (Asn-X-Ser/Thr, X≠Pro): creates batch-to-batch glycoform heterogeneity (CQA) and can block the antigen-binding site.',
    links: [
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
      { label: 'Geneious Biologics — Sequence Liabilities', url: 'https://help.geneiousbiologics.com/hc/en-us/articles/5324606679060-Antibody-Sequence-Liabilities' },
    ],
  },

  // ── Oxidation ────────────────────────────────────────────────────────────────
  {
    id: 'MET', name: 'Met Oxidation', pattern: 'M',
    category: 'oxidation', severity: 'medium',
    description: 'Methionine → sulfoxide (+16 Da) by ROS/light. Fc Met-252/428 loss reduces FcRn binding; CDR Met oxidation disrupts antigen contact. Use "solvent-exposed only" to reduce false positives.',
    links: [
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },
  {
    id: 'TRP', name: 'Trp Oxidation', pattern: 'W',
    category: 'oxidation', severity: 'medium',
    description: 'Tryptophan photo-oxidised to kynurenine/hydroxytryptophan. CDR Trp residues frequently contact antigen directly. Use "solvent-exposed only" to reduce false positives.',
    links: [
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },

  // ── Cysteine ─────────────────────────────────────────────────────────────────
  {
    id: 'CYS', name: 'Free Cysteine', pattern: 'C',
    category: 'cysteine', severity: 'high',
    description: 'Unpaired Cys forms aberrant disulfides causing aggregation; undergoes cysteinylation from media (heterogeneous CQA adducts). Almost never present in approved therapeutics.',
    links: [
      { label: 'Seeliger et al. 2015 — antibody developability', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4622947/' },
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },

  // ── Fragmentation ────────────────────────────────────────────────────────────
  {
    id: 'DP', name: 'DP Clipping', pattern: 'DP',
    category: 'fragmentation', severity: 'high',
    description: 'Asp-Pro: uniquely susceptible to acid-catalysed backbone hydrolysis via Pro secondary amine. Common clipping site at low-pH viral inactivation and reversed-phase purification.',
    links: [
      { label: 'Fragmentation of monoclonal antibodies (2011)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3149706/' },
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },
  {
    id: 'NP', name: 'NP Clipping', pattern: 'NP',
    category: 'fragmentation', severity: 'medium',
    description: 'Asn-Pro: two-step liability — deamidation converts Asn→Asp, then DP acid hydrolysis cleaves the backbone. Dual deamidation and fragmentation risk.',
    links: [
      { label: 'Fragmentation of monoclonal antibodies (2011)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3149706/' },
    ],
  },

  // ── Integrin / off-target binding ────────────────────────────────────────────
  {
    id: 'RGD', name: 'RGD Integrin', pattern: 'RGD',
    category: 'integrin', severity: 'medium',
    description: 'Integrin-binding tripeptide (Arg-Gly-Asp) found in ECM proteins. CDR RGD mediates off-target binding to αv integrins → non-specific cell uptake and altered PK/PD.',
    links: [
      { label: 'Pierschbacher & Ruoslahti 1987', url: 'https://pubmed.ncbi.nlm.nih.gov/8970741/' },
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },
  {
    id: 'NGR', name: 'NGR Integrin', pattern: 'NGR',
    category: 'integrin', severity: 'low',
    description: 'Deamidation converts NGR→isoDGR, an αv-β3 integrin ligand. Dual liability: deamidation site + latent integrin-binding motif activated by that deamidation.',
    links: [
      { label: 'Corti et al. 2008 — NGR→isoDGR integrin binding', url: 'https://pubmed.ncbi.nlm.nih.gov/17921402/' },
      { label: 'LAP liability profiler', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC10957075/' },
    ],
  },
]

export const LIABILITY_CATEGORIES: LiabilityCategory[] = [
  'deamidation',
  'isomerization',
  'glycosylation',
  'oxidation',
  'cysteine',
  'fragmentation',
  'integrin',
]

export const CATEGORY_LABELS: Record<LiabilityCategory, string> = {
  deamidation:   'Deamidation',
  isomerization: 'Isomerization',
  glycosylation: 'Glycosylation',
  oxidation:     'Oxidation',
  cysteine:      'Cysteine',
  fragmentation: 'Fragmentation',
  integrin:      'Integrin / Off-target',
}

/**
 * Convert an AxC-style user pattern to a RegExp.
 * Each lowercase `x` matches exactly one amino acid.
 *   AxC  → matches ATC  (3 chars)
 *   AxxC → matches ATTC (4 chars)
 * Returns null if the pattern is empty or produces an invalid regex.
 */
export function customPatternToRegex(pattern: string): RegExp | null {
  if (!pattern.trim()) return null
  // Escape regex-special chars first, then replace x → single-AA wildcard
  const escaped   = pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&')
  const regexStr  = escaped.replace(/x/g, '[A-Z]')
  try { return new RegExp(regexStr) } catch { return null }
}

/** Module-level regex cache to avoid recompilation on every passesFilters call. */
const _regexCache = new Map<string, RegExp>()

export function getCachedRegex(pattern: string): RegExp {
  let re = _regexCache.get(pattern)
  if (!re) {
    re = new RegExp(pattern)
    _regexCache.set(pattern, re)
  }
  return re
}
