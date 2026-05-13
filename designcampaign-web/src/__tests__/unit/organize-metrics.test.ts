import { describe, expect, it } from 'vitest'
import { organizeMetrics } from '@/components/inspector/DetailsInspector'

describe('organizeMetrics', () => {
  it('returns flat single-entry list for one key', () => {
    const { sectionPrefix, groups } = organizeMetrics(['mean_plddt'])
    expect(sectionPrefix).toBe('')
    expect(groups).toEqual([{ prefix: null, entries: [{ key: 'mean_plddt', label: 'mean_plddt' }] }])
  })

  it('strips common dotted section prefix', () => {
    const keys = [
      'payload.job_status.response_payload.ptm',
      'payload.job_status.response_payload.iptm',
      'payload.job_status.response_payload.confidence_score',
    ]
    const { sectionPrefix, groups } = organizeMetrics(keys)
    expect(sectionPrefix).toBe('payload.job_status.response_payload')
    expect(groups.map(g => g.entries[0].label)).toEqual(['ptm', 'iptm', 'confidence_score'])
    expect(groups.every(g => g.prefix === null)).toBe(true)
  })

  it('sub-groups names sharing a leading token (≥ 2 members)', () => {
    const keys = ['asa_mean', 'asa_min', 'asa_max', 'ptm']
    const { groups } = organizeMetrics(keys)
    expect(groups).toEqual([
      { prefix: 'asa', entries: [
        { key: 'asa_mean', label: 'mean' },
        { key: 'asa_min',  label: 'min'  },
        { key: 'asa_max',  label: 'max'  },
      ] },
      { prefix: null, entries: [{ key: 'ptm', label: 'ptm' }] },
    ])
  })

  it('never strips so far that any key becomes empty', () => {
    // When every key shares the same leading token, that token becomes the section prefix.
    // The bare member ('pLDDT_score') prevents pLDDT_score itself from being stripped.
    const keys = ['pLDDT_score', 'pLDDT_score_per_residue_mean', 'pLDDT_score_per_residue_min']
    const { sectionPrefix, groups } = organizeMetrics(keys)
    expect(sectionPrefix).toBe('pLDDT')
    expect(groups.map(g => g.entries[0].label)).toEqual([
      'score', 'score_per_residue_mean', 'score_per_residue_min',
    ])
  })

  it('combines section prefix + sub-grouping on a realistic nested payload', () => {
    const keys = [
      'payload.job_status.response_payload.pLDDT_score',
      'payload.job_status.response_payload.pLDDT_score_per_residue_mean',
      'payload.job_status.response_payload.asa_mean',
      'payload.job_status.response_payload.asa_min',
      'payload.job_status.response_payload.ptm',
      'payload.job_status.response_payload.complex_plddt',
      'payload.job_status.response_payload.complex_iplddt',
      'payload.job_status.response_payload.complex_pae_scores.A_B.ipsae_max',
      'payload.job_status.response_payload.complex_pae_scores.A_B.ipsae_min',
    ]
    const { sectionPrefix, groups } = organizeMetrics(keys)
    expect(sectionPrefix).toBe('payload.job_status.response_payload')
    const prefixes = groups.map(g => g.prefix)
    expect(prefixes).toContain('asa')
    expect(prefixes).toContain('complex')
    expect(prefixes).toContain(null)  // ptm singleton
    const ptm = groups.find(g => g.prefix === null && g.entries[0].key.endsWith('.ptm'))
    expect(ptm?.entries[0].label).toBe('ptm')
    const asa = groups.find(g => g.prefix === 'asa')
    expect(asa?.entries.map(e => e.label).sort()).toEqual(['mean', 'min'])
  })

  it('falls back to flat when bucket members share no clean separator-aligned prefix', () => {
    const keys = ['foobar', 'foobaz']  // share "foo" but no separator after
    const { sectionPrefix, groups } = organizeMetrics(keys)
    expect(sectionPrefix).toBe('')
    expect(groups).toEqual([
      { prefix: null, entries: [{ key: 'foobar', label: 'foobar' }] },
      { prefix: null, entries: [{ key: 'foobaz', label: 'foobaz' }] },
    ])
  })
})
