import { describe, it, expect } from 'vitest'
import { customPatternToRegex, getCachedRegex, LIABILITY_PRESETS } from '@/lib/sequence-liabilities'

// Factories return /g-flagged regexes; test() advances lastIndex between calls,
// so every assertion uses a fresh regex via this helper.
function matches(pattern: string, seq: string): boolean {
  const re = customPatternToRegex(pattern)
  return re !== null && re.test(seq)
}

describe('customPatternToRegex', () => {
  it('returns null for empty string', () => {
    expect(customPatternToRegex('')).toBeNull()
    expect(customPatternToRegex('   ')).toBeNull()
  })

  it('escapes regex metacharacters so any input is safe to compile', () => {
    // The escape pass means [, (, etc. become literal — they no longer break
    // the regex. The catch branch remains as defense in depth.
    const re = customPatternToRegex('A[C')!
    expect(re).not.toBeNull()
    expect(re.test('A[C')).toBe(true)
    expect(re.test('ABC')).toBe(false)
  })

  it('compiles with the /g flag so exec() can advance through a sequence', () => {
    expect(customPatternToRegex('NG')!.flags).toContain('g')
  })

  it('matches exact sequences without wildcards', () => {
    expect(matches('NG', 'ANG')).toBe(true)
    expect(matches('NG', 'NGA')).toBe(true)
    expect(matches('NG', 'ANA')).toBe(false)
  })

  it('treats lowercase x as exactly one amino acid', () => {
    expect(matches('AxC', 'ATC')).toBe(true)    // A, T, C — one AA in middle
    expect(matches('AxC', 'AGC')).toBe(true)
    expect(matches('AxC', 'AC')).toBe(false)    // no middle AA
    expect(matches('AxC', 'ATTC')).toBe(false)  // two AAs in middle
  })

  it('AxxC requires exactly two amino acids', () => {
    expect(matches('AxxC', 'ATTC')).toBe(true)
    expect(matches('AxxC', 'ATC')).toBe(false)   // only one
    expect(matches('AxxC', 'ATTTC')).toBe(false) // three
  })

  it('escapes regex special characters in the pattern', () => {
    expect(matches('A.C', 'ABC')).toBe(false)    // . is escaped, not a wildcard
    expect(matches('A.C', 'A.C')).toBe(true)
  })

  it('uppercase letters remain literal', () => {
    expect(matches('NxS', 'NAS')).toBe(true)
    expect(matches('NxS', 'NTS')).toBe(true)
    expect(matches('NxS', 'MAS')).toBe(false)    // first AA must be N
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
    expect(new RegExp(p.pattern).test('QVQLNG')).toBe(true)
    expect(new RegExp(p.pattern).test('QVQLNS')).toBe(false)
  })

  it('NGLYC preset matches N-X-S/T sequon (X != P)', () => {
    const p = LIABILITY_PRESETS.find(p => p.id === 'NGLYC')!
    expect(new RegExp(p.pattern).test('QNAST')).toBe(true)   // NAS = N[A]S → matches
    expect(new RegExp(p.pattern).test('QNPST')).toBe(false)  // NPS = N[P]S → no match (X=P excluded)
    expect(new RegExp(p.pattern).test('QNATT')).toBe(true)   // NAT = N[A]T → matches
  })
})
