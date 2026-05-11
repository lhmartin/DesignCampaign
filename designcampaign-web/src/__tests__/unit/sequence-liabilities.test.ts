import { describe, it, expect } from 'vitest'
import { customPatternToRegex, getCachedRegex, LIABILITY_PRESETS } from '@/lib/sequence-liabilities'

describe('customPatternToRegex', () => {
  it('returns null for empty string', () => {
    expect(customPatternToRegex('')).toBeNull()
    expect(customPatternToRegex('   ')).toBeNull()
  })

  it('returns null for invalid regex', () => {
    expect(customPatternToRegex('A[C')).toBeNull()
    expect(customPatternToRegex('A(')).toBeNull()
  })

  it('matches exact sequences without wildcards', () => {
    const re = customPatternToRegex('NG')!
    expect(re).not.toBeNull()
    expect(re.test('ANG')).toBe(true)
    expect(re.test('NGA')).toBe(true)
    expect(re.test('ANA')).toBe(false)
  })

  it('treats lowercase x as exactly one amino acid', () => {
    const re = customPatternToRegex('AxC')!
    expect(re).not.toBeNull()
    expect(re.test('ATC')).toBe(true)    // A, T, C — one AA in middle
    expect(re.test('AGC')).toBe(true)
    expect(re.test('AC')).toBe(false)    // no middle AA
    expect(re.test('ATTC')).toBe(false)  // two AAs in middle
  })

  it('AxxC requires exactly two amino acids', () => {
    const re = customPatternToRegex('AxxC')!
    expect(re.test('ATTC')).toBe(true)
    expect(re.test('ATC')).toBe(false)   // only one
    expect(re.test('ATTTC')).toBe(false) // three
  })

  it('escapes regex special characters in the pattern', () => {
    const re = customPatternToRegex('A.C')!
    expect(re.test('ABC')).toBe(false)   // . is escaped, not a wildcard
    expect(re.test('A.C')).toBe(true)
  })

  it('uppercase letters remain literal', () => {
    const re = customPatternToRegex('NxS')!
    expect(re.test('NAS')).toBe(true)
    expect(re.test('NTS')).toBe(true)
    expect(re.test('MAS')).toBe(false)   // first AA must be N
  })
})

describe('getCachedRegex', () => {
  it('returns same RegExp instance for repeated calls with same pattern', () => {
    const re1 = getCachedRegex('NG')
    const re2 = getCachedRegex('NG')
    expect(re1).toBe(re2)
  })

  it('returns different RegExp for different patterns', () => {
    const re1 = getCachedRegex('NG')
    const re2 = getCachedRegex('DG')
    expect(re1).not.toBe(re2)
  })
})

describe('LIABILITY_PRESETS', () => {
  it('all preset IDs are unique', () => {
    const ids = LIABILITY_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('all presets have non-empty patterns that compile to valid RegExp', () => {
    for (const p of LIABILITY_PRESETS) {
      expect(() => new RegExp(p.pattern)).not.toThrow()
      expect(p.pattern.length).toBeGreaterThan(0)
    }
  })

  it('NG preset matches NG in a sequence', () => {
    const p = LIABILITY_PRESETS.find(p => p.id === 'NG')!
    const re = new RegExp(p.pattern)
    expect(re.test('QVQLNG')).toBe(true)
    expect(re.test('QVQLNS')).toBe(false)
  })

  it('NGLYC preset matches N-X-S/T sequon (X != P)', () => {
    const p = LIABILITY_PRESETS.find(p => p.id === 'NGLYC')!
    const re = new RegExp(p.pattern)
    expect(re.test('QNAST')).toBe(true)   // NAS = N[A]S → matches
    expect(re.test('QNPST')).toBe(false)  // NPS = N[P]S → no match (X=P excluded)
    expect(re.test('QNATT')).toBe(true)   // NAT = N[A]T → matches
  })
})
