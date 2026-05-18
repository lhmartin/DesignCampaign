import { describe, it, expect, beforeEach } from 'vitest'
import { useFilterStore, type NumericFilterRule, type ResidueFilterRule, type LiabilityFilterRule } from '@/stores/filter-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useBatchInterfaceStore } from '@/stores/batch-interface-store'
import { useSequenceStore } from '@/stores/sequence-store'
import { useInterfaceStore } from '@/stores/interface-store'

beforeEach(() => {
  useFilterStore.getState().clearRules()
  useFilterStore.setState({ rankingMetrics: [], presets: [] })
  useMetricsStore.getState().clearAll()
  useBatchInterfaceStore.getState().clear()
  useSequenceStore.getState().clearAll()
  useInterfaceStore.setState({ binderChains: [], targetChains: [] })
  window.localStorage.clear()
})

// ─── Rule CRUD ────────────────────────────────────────────────────────────────

describe('rule management', () => {
  it('addRule adds a numeric rule with type="numeric"', () => {
    useFilterStore.getState().addRule()
    const rules = useFilterStore.getState().rules
    expect(rules).toHaveLength(1)
    expect(rules[0].type).toBe('numeric')
  })

  it('addResidueRule adds a rule with type="residue"', () => {
    useFilterStore.getState().addResidueRule()
    const rules = useFilterStore.getState().rules
    expect(rules).toHaveLength(1)
    expect(rules[0].type).toBe('residue')
    const r = rules[0] as ResidueFilterRule
    expect(r.target).toBe('paratope')
    expect(r.mode).toBe('any')
    expect(r.residues).toBe('')
  })

  it('updateRule patches a numeric rule', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'mean_plddt', op: '>=', value: 70 })
    const rule = useFilterStore.getState().rules[0] as NumericFilterRule
    expect(rule.metric).toBe('mean_plddt')
    expect(rule.op).toBe('>=')
    expect(rule.value).toBe(70)
  })

  it('removeRule removes the specified rule', () => {
    useFilterStore.getState().addRule()
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().removeRule(id)
    expect(useFilterStore.getState().rules).toHaveLength(1)
    expect(useFilterStore.getState().rules[0].id).not.toBe(id)
  })

  it('clearRules empties all rules', () => {
    useFilterStore.getState().addRule()
    useFilterStore.getState().addRule()
    useFilterStore.getState().clearRules()
    expect(useFilterStore.getState().rules).toHaveLength(0)
  })
})

// ─── passesFilters — numeric rules ───────────────────────────────────────────

describe('passesFilters — numeric rules', () => {
  const metrics = { score: 75, plddt: 85 }

  it('passes when no rules defined', () => {
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('passes when rule metric is empty (blank rule)', () => {
    useFilterStore.getState().addRule()   // metric = '' by default
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('passes when metric has no data for the row', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'nonexistent', op: '>=', value: 0 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('>= passes when value meets threshold', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '>=', value: 75 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('>= fails when value is below threshold', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '>=', value: 76 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(false)
  })

  it('> passes when strictly greater', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '>', value: 74 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('> fails when equal (strict comparison)', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '>', value: 75 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(false)
  })

  it('<= passes when value meets threshold', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '<=', value: 75 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('< fails when equal', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '<', value: 75 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(false)
  })

  it('= passes when exactly equal', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '=', value: 75 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(true)
  })

  it('= fails when not equal', () => {
    useFilterStore.getState().addRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { metric: 'score', op: '=', value: 76 })
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(false)
  })

  it('multiple rules — all must pass (AND logic)', () => {
    useFilterStore.getState().addRule()
    useFilterStore.getState().addRule()
    const [id1, id2] = useFilterStore.getState().rules.map(r => r.id)
    useFilterStore.getState().updateRule(id1, { metric: 'score', op: '>=', value: 70 })
    useFilterStore.getState().updateRule(id2, { metric: 'plddt', op: '>=', value: 90 })
    // score passes (75 >= 70) but plddt fails (85 < 90) → overall fail
    expect(useFilterStore.getState().passesFilters(metrics)).toBe(false)
  })
})

// ─── passesFilters — residue rules ───────────────────────────────────────────

describe('passesFilters — residue rules', () => {
  const filePath = '/test.pdb'

  beforeEach(() => {
    useBatchInterfaceStore.setState({
      results: {
        [filePath]: {
          paratope: ['A:42', 'A:67', 'A:10'],
          epitope:  ['B:100', 'B:105'],
          nHBonds: 0, nClashes: 0,
          paratopeProps: { charge: 0, hydrophobicity: 0, aromatic: 0, polar: 0, nonpolar: 0 },
          epitopeProps:  { charge: 0, hydrophobicity: 0, aromatic: 0, polar: 0, nonpolar: 0 },
        },
      },
    })
  })

  it('passes when residues field is empty (blank rule)', () => {
    useFilterStore.getState().addResidueRule()
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('passes when no filePath provided (can\'t check batch data)', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { residues: '42', mode: 'any' })
    expect(useFilterStore.getState().passesFilters({})).toBe(true)
  })

  it('passes when filePath has no batch result', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { residues: '42', mode: 'any' })
    expect(useFilterStore.getState().passesFilters({}, '/no-batch-data.pdb')).toBe(true)
  })

  it('ANY mode: passes when at least one residue is present in paratope', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'paratope', residues: '42, 999', mode: 'any' })
    // 42 is in paratope, 999 is not — ANY → true
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('ANY mode: fails when no residue is present', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'paratope', residues: '999, 888', mode: 'any' })
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('ALL mode: passes when all residues are present', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'paratope', residues: '42, 67', mode: 'all' })
    // Both 42 and 67 are in paratope → true
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('ALL mode: fails when any residue is missing', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'paratope', residues: '42, 999', mode: 'all' })
    // 42 present, 999 not → ALL fails
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('chain-qualified spec: A:42 matches only chain A residue 42', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'paratope', residues: 'A:42', mode: 'any' })
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('chain-qualified spec: B:42 fails because chain B residue 42 is not in paratope', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'paratope', residues: 'B:42', mode: 'any' })
    // Paratope has A:42, A:67, A:10 — no B:42
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('targets epitope correctly', () => {
    useFilterStore.getState().addResidueRule()
    const id = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(id, { target: 'epitope', residues: '100', mode: 'any' })
    // B:100 is in epitope → passes
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })
})

// ─── syncRankingMetrics ───────────────────────────────────────────────────────

describe('syncRankingMetrics', () => {
  it('adds new columns as inactive metrics with default weight 0.5', () => {
    useFilterStore.getState().syncRankingMetrics(['mean_plddt', 'chain_count'])
    const metrics = useFilterStore.getState().rankingMetrics
    expect(metrics).toHaveLength(2)
    expect(metrics[0].active).toBe(false)
    expect(metrics[0].weight).toBe(0.5)
    expect(metrics[0].direction).toBe('max')
  })

  it('excludes virtual columns (paratope_residues, epitope_residues)', () => {
    useFilterStore.getState().syncRankingMetrics([
      'mean_plddt', 'paratope_residues', 'epitope_residues',
    ])
    const names = useFilterStore.getState().rankingMetrics.map(m => m.metric)
    expect(names).toContain('mean_plddt')
    expect(names).not.toContain('paratope_residues')
    expect(names).not.toContain('epitope_residues')
  })

  it('does not re-add columns that already exist', () => {
    useFilterStore.getState().syncRankingMetrics(['mean_plddt'])
    useFilterStore.getState().syncRankingMetrics(['mean_plddt', 'chain_count'])
    const names = useFilterStore.getState().rankingMetrics.map(m => m.metric)
    expect(names.filter(n => n === 'mean_plddt')).toHaveLength(1)
  })
})

// ─── Presets ──────────────────────────────────────────────────────────────────

describe('presets', () => {
  it('savePreset stores current rules under a given name', () => {
    useFilterStore.getState().addRule()
    const ruleId = useFilterStore.getState().rules[0].id
    useFilterStore.getState().updateRule(ruleId, { metric: 'mean_plddt', op: '>=', value: 70 })
    useFilterStore.getState().savePreset('myPreset')
    const preset = useFilterStore.getState().presets[0]
    expect(preset.name).toBe('myPreset')
    expect(preset.rules).toHaveLength(1)
  })

  it('loadPreset restores rules from saved preset', () => {
    useFilterStore.getState().addRule()
    useFilterStore.getState().savePreset('saved')
    useFilterStore.getState().clearRules()
    expect(useFilterStore.getState().rules).toHaveLength(0)
    const id = useFilterStore.getState().presets[0].id
    useFilterStore.getState().loadPreset(id)
    expect(useFilterStore.getState().rules).toHaveLength(1)
  })

  it('deletePreset removes the preset', () => {
    useFilterStore.getState().savePreset('toDelete')
    const id = useFilterStore.getState().presets[0].id
    useFilterStore.getState().deletePreset(id)
    expect(useFilterStore.getState().presets).toHaveLength(0)
  })

  it('exportPresetJSON produces valid JSON', () => {
    useFilterStore.getState().savePreset('exported')
    const id = useFilterStore.getState().presets[0].id
    const json = useFilterStore.getState().exportPresetJSON(id)
    expect(() => JSON.parse(json)).not.toThrow()
    expect(JSON.parse(json).name).toBe('exported')
  })

  it('importPresetJSON restores a preset from exported JSON', () => {
    useFilterStore.getState().savePreset('original')
    const id = useFilterStore.getState().presets[0].id
    const json = useFilterStore.getState().exportPresetJSON(id)
    useFilterStore.setState({ presets: [] })
    useFilterStore.getState().importPresetJSON(json)
    expect(useFilterStore.getState().presets).toHaveLength(1)
    expect(useFilterStore.getState().presets[0].name).toBe('original')
  })
})

// ─── passesFilters — liability rules ─────────────────────────────────────────

describe('passesFilters — liability rules', () => {
  const filePath = '/test.pdb'

  function addLiabilityRule(patch: Partial<LiabilityFilterRule> = {}) {
    useFilterStore.getState().addLiabilityRule()
    const id = useFilterStore.getState().rules[0].id
    if (Object.keys(patch).length > 0) useFilterStore.getState().updateRule(id, patch)
    return id
  }

  function seedSequence(chain: string, seq: string, exposedMask?: boolean[]) {
    useSequenceStore.getState().mergeSequences(
      new Map([[filePath, [{ chain, seq, ...(exposedMask ? { exposedMask } : {}) }]]])
    )
  }

  it('addLiabilityRule creates a rule with type="liability"', () => {
    useFilterStore.getState().addLiabilityRule()
    const rule = useFilterStore.getState().rules[0] as LiabilityFilterRule
    expect(rule.type).toBe('liability')
    expect(rule.presets).toEqual([])
    expect(rule.customPatterns).toEqual([])
    expect(rule.chainMode).toBe('binder')
    expect(rule.cdrOnly).toBe(false)
    expect(rule.exposedOnly).toBe(false)
  })

  it('passes when no presets or custom patterns are selected', () => {
    addLiabilityRule()
    seedSequence('A', 'QVQLNG')
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('passes when no filePath is provided', () => {
    addLiabilityRule({ presets: ['NG'] })
    expect(useFilterStore.getState().passesFilters({})).toBe(true)
  })

  it('passes when no sequence data exists for the file', () => {
    addLiabilityRule({ presets: ['NG'], chainMode: 'all' })
    // No sequences seeded — should pass gracefully
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('fails when preset pattern found in sequence (chainMode=all)', () => {
    addLiabilityRule({ presets: ['NG'], chainMode: 'all' })
    seedSequence('A', 'QVQLNGVQ')  // contains NG
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('passes when preset pattern not found in sequence', () => {
    addLiabilityRule({ presets: ['NG'], chainMode: 'all' })
    seedSequence('A', 'QVQLQVQL')  // no NG
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('fails with custom pattern when match found', () => {
    addLiabilityRule({ customPatterns: ['AxC'], chainMode: 'all' })
    seedSequence('A', 'QVATCQVQ')  // ATC matches AxC
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('passes with custom pattern when no match', () => {
    addLiabilityRule({ customPatterns: ['AxC'], chainMode: 'all' })
    seedSequence('A', 'QVATTCQVQ')  // ATTC does NOT match AxC (two AAs between A and C)
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('chainMode=binder only checks binder chains', () => {
    useInterfaceStore.setState({ binderChains: ['A'], targetChains: ['B'] })
    addLiabilityRule({ presets: ['NG'], chainMode: 'binder' })
    // NG is only on target chain B, not binder chain A
    useSequenceStore.getState().mergeSequences(new Map([[filePath, [
      { chain: 'A', seq: 'QVQLQVQL' },
      { chain: 'B', seq: 'QVQLNGVQ' },
    ]]]))
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('chainMode=binder excludes structure when binder chain contains liability', () => {
    useInterfaceStore.setState({ binderChains: ['A'], targetChains: ['B'] })
    addLiabilityRule({ presets: ['NG'], chainMode: 'binder' })
    useSequenceStore.getState().mergeSequences(new Map([[filePath, [
      { chain: 'A', seq: 'QVQLNGVQ' },  // NG in binder → should fail
      { chain: 'B', seq: 'QVQLQVQL' },
    ]]]))
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('exposedOnly: buried match (all false mask) does not trigger exclusion', () => {
    addLiabilityRule({ presets: ['NG'], chainMode: 'all', exposedOnly: true })
    const seq = 'QVQLNGVQ'
    const exposedMask = seq.split('').map(() => false)  // all buried
    seedSequence('A', seq, exposedMask)
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('exposedOnly: exposed match triggers exclusion', () => {
    addLiabilityRule({ presets: ['NG'], chainMode: 'all', exposedOnly: true })
    const seq = 'QVQLNGVQ'
    // N is at index 4, G at index 5 — mark G as exposed
    const exposedMask = [false, false, false, false, false, true, false, false]
    seedSequence('A', seq, exposedMask)
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('multiple presets: fails when any preset matches', () => {
    addLiabilityRule({ presets: ['NG', 'DG'], chainMode: 'all' })
    seedSequence('A', 'QVQLNG')  // NG matches, no DG
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('exposedOnly: skips buried match and finds the next exposed match in the same sequence', () => {
    // Regression: pre-/g-flag the filter looped forever on the first match when
    // it failed the exposedOnly check. Now the regex must advance lastIndex and
    // discover the second NG occurrence.
    addLiabilityRule({ presets: ['NG'], chainMode: 'all', exposedOnly: true })
    const seq = 'NGAAAANG'  // NG at index 0 (buried) and index 6 (exposed)
    const exposedMask = [false, false, false, false, false, false, true, true]
    seedSequence('A', seq, exposedMask)
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(false)
  })

  it('exposedOnly: terminates and passes when every match is buried', () => {
    // Same regression — even with no second match, the loop must terminate.
    addLiabilityRule({ presets: ['NG'], chainMode: 'all', exposedOnly: true })
    const seq = 'NGAAAANG'  // two NGs, both buried
    const exposedMask = seq.split('').map(() => false)
    seedSequence('A', seq, exposedMask)
    expect(useFilterStore.getState().passesFilters({}, filePath)).toBe(true)
  })

  it('liability rule persists and round-trips through preset export/import', () => {
    addLiabilityRule({ presets: ['NG', 'DG'], chainMode: 'all' })
    useFilterStore.getState().savePreset('liabilityPreset')
    const id = useFilterStore.getState().presets[0].id
    const json = useFilterStore.getState().exportPresetJSON(id)
    useFilterStore.getState().clearRules()
    useFilterStore.getState().loadPreset(id)
    const rule = useFilterStore.getState().rules[0] as LiabilityFilterRule
    expect(rule.type).toBe('liability')
    expect(rule.presets).toEqual(['NG', 'DG'])
    // Also verify exported JSON has the rule
    const parsed = JSON.parse(json)
    expect(parsed.rules[0].type).toBe('liability')
  })
})
