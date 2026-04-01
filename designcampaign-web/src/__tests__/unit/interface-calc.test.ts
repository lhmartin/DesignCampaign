import { describe, it, expect } from 'vitest'
import { computeContacts } from '@/lib/interface-calc'
import type { AtomRecord } from '@/lib/parsers/parse-atoms'

// ─── Atom builder ────────────────────────────────────────────────────────────

function atom(chain: string, resId: number, x: number, y: number, z: number, resName = 'ALA'): AtomRecord {
  return { chain, resId, resName, atomName: 'CA', x, y, z }
}

describe('computeContacts', () => {
  describe('basic contact detection', () => {
    it('detects a contact when two atoms are within the cutoff', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const target = [atom('B', 1, 3, 0, 0)]   // distance = 3 < 6
      const { paratope, epitope, nContacts } = computeContacts(binder, target, 6)
      expect(paratope.size).toBe(1)
      expect(epitope.size).toBe(1)
      expect(nContacts).toBe(1)
    })

    it('detects no contact when atoms are beyond the cutoff', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const target = [atom('B', 1, 10, 0, 0)]  // distance = 10 > 6
      const { paratope, epitope, nContacts } = computeContacts(binder, target, 6)
      expect(paratope.size).toBe(0)
      expect(epitope.size).toBe(0)
      expect(nContacts).toBe(0)
    })

    it('counts contact when distance equals exactly the cutoff (≤ comparison)', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const target = [atom('B', 1, 6, 0, 0)]   // distance = exactly 6.0
      const { nContacts } = computeContacts(binder, target, 6)
      expect(nContacts).toBe(1)
    })

    it('returns no contacts for empty binder array', () => {
      const target = [atom('B', 1, 0, 0, 0)]
      const { paratope, epitope, nContacts } = computeContacts([], target, 6)
      expect(paratope.size).toBe(0)
      expect(epitope.size).toBe(0)
      expect(nContacts).toBe(0)
    })

    it('returns no contacts for empty target array', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const { paratope, epitope, nContacts } = computeContacts(binder, [], 6)
      expect(paratope.size).toBe(0)
      expect(epitope.size).toBe(0)
      expect(nContacts).toBe(0)
    })
  })

  describe('residue key format', () => {
    it('residue keys follow "chain:resId" format', () => {
      const binder = [atom('H', 42, 0, 0, 0)]
      const target = [atom('Y', 99, 1, 0, 0)]
      const { paratope, epitope } = computeContacts(binder, target, 6)
      expect(paratope.has('H:42')).toBe(true)
      expect(epitope.has('Y:99')).toBe(true)
    })
  })

  describe('deduplication', () => {
    it('paratope/epitope are deduped: multiple atoms from same residue count once', () => {
      // 3 binder atoms from residue A:1, all in contact with target
      const binder = [
        atom('A', 1, 0, 0, 0),
        atom('A', 1, 0.5, 0, 0),
        atom('A', 1, 1.0, 0, 0),
      ]
      const target = [atom('B', 1, 2, 0, 0)]
      const { paratope, nContacts } = computeContacts(binder, target, 6)
      expect(paratope.size).toBe(1)     // still 1 unique residue
      expect(nContacts).toBe(3)         // but 3 atom-pair contacts
    })

    it('epitope correctly deduplicates across many binder atoms', () => {
      // 5 binder atoms all contacting the same 1 target residue
      const binder = Array.from({ length: 5 }, (_, i) => atom('A', i + 1, i, 0, 0))
      const target = [atom('B', 1, 4, 0, 0)]  // within 6 of all binder atoms
      const { epitope, nContacts } = computeContacts(binder, target, 6)
      expect(epitope.size).toBe(1)
      expect(nContacts).toBeGreaterThan(1)
    })
  })

  describe('multi-residue scenarios', () => {
    it('correctly identifies multiple paratope residues', () => {
      const binder = [
        atom('A', 10, 0, 0, 0),
        atom('A', 11, 2, 0, 0),
        atom('A', 12, 100, 0, 0),  // far — no contact
      ]
      const target = [atom('B', 1, 1, 0, 0)]
      const { paratope } = computeContacts(binder, target, 6)
      expect(paratope.has('A:10')).toBe(true)
      expect(paratope.has('A:11')).toBe(true)
      expect(paratope.has('A:12')).toBe(false)
    })

    it('correctly identifies multiple epitope residues', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const target = [
        atom('B', 5,  1, 0, 0),   // within 6
        atom('B', 6,  3, 0, 0),   // within 6
        atom('B', 7, 50, 0, 0),   // far — no contact
      ]
      const { epitope } = computeContacts(binder, target, 6)
      expect(epitope.has('B:5')).toBe(true)
      expect(epitope.has('B:6')).toBe(true)
      expect(epitope.has('B:7')).toBe(false)
    })
  })

  describe('cutoff sensitivity', () => {
    it('larger cutoff finds more contacts', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const target = [
        atom('B', 1, 4, 0, 0),   // within 6 and 8
        atom('B', 2, 7, 0, 0),   // within 8, not 6
      ]
      const r6 = computeContacts(binder, target, 6)
      const r8 = computeContacts(binder, target, 8)
      expect(r8.paratope.size).toBeGreaterThanOrEqual(r6.paratope.size)
      expect(r8.epitope.size).toBeGreaterThan(r6.epitope.size)
    })

    it('increasing cutoff only adds residues, never removes them', () => {
      const binder = [atom('A', 1, 0, 0, 0)]
      const target = [
        atom('B', 1, 2, 0, 0),
        atom('B', 2, 5, 0, 0),
        atom('B', 3, 9, 0, 0),
      ]
      const r4 = computeContacts(binder, target, 4)
      const r6 = computeContacts(binder, target, 6)
      const r10 = computeContacts(binder, target, 10)
      // Every residue in r4 must be in r6
      for (const key of r4.epitope) expect(r6.epitope.has(key)).toBe(true)
      // Every residue in r6 must be in r10
      for (const key of r6.epitope) expect(r10.epitope.has(key)).toBe(true)
    })
  })
})
