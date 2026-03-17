import { describe, it, expect } from 'vitest'
import { parseAtoms } from '@/lib/parsers/parse-atoms'
import {
  makePdbLine,
  CHAIN_A,
  CHAIN_B_NEAR,
  NOISY_PDB,
  TWO_CHAIN_PDB,
} from '../fixtures/pdb-fragments'

describe('parseAtoms', () => {
  describe('basic parsing', () => {
    it('returns correct chain, resId, atomName, and coords', () => {
      const pdb = makePdbLine('CA', 'A', 5, 1.0, 2.0, 3.0, 50.0)
      const atoms = parseAtoms(pdb, ['A'], 'all-heavy')
      expect(atoms).toHaveLength(1)
      expect(atoms[0]).toMatchObject({ chain: 'A', resId: 5, atomName: 'CA' })
      expect(atoms[0].x).toBeCloseTo(1.0)
      expect(atoms[0].y).toBeCloseTo(2.0)
      expect(atoms[0].z).toBeCloseTo(3.0)
    })

    it('handles multi-residue, multi-atom PDB', () => {
      const atoms = parseAtoms(CHAIN_A, ['A'], 'all-heavy')
      // 7 lines: N, CA, C, O, CB for res1; CA for res2; CA for res3
      expect(atoms).toHaveLength(7)
    })

    it('returns empty array for empty PDB string', () => {
      expect(parseAtoms('', ['A'], 'all-heavy')).toHaveLength(0)
    })
  })

  describe('chain filtering', () => {
    it('only returns atoms from specified chains', () => {
      const atoms = parseAtoms(TWO_CHAIN_PDB, ['A'], 'all-heavy')
      expect(atoms.every(a => a.chain === 'A')).toBe(true)
    })

    it('returns atoms from multiple chains when both specified', () => {
      const atoms = parseAtoms(TWO_CHAIN_PDB, ['A', 'B'], 'all-heavy')
      const chains = new Set(atoms.map(a => a.chain))
      expect(chains.has('A')).toBe(true)
      expect(chains.has('B')).toBe(true)
    })

    it('returns nothing when chain filter is empty', () => {
      expect(parseAtoms(CHAIN_A, [], 'all-heavy')).toHaveLength(0)
    })

    it('chain filter is case-sensitive (A ≠ a)', () => {
      // Our fixture uses uppercase A — lowercase a should match nothing
      expect(parseAtoms(CHAIN_A, ['a'], 'all-heavy')).toHaveLength(0)
    })

    it('returns nothing when chain does not exist in PDB', () => {
      expect(parseAtoms(CHAIN_A, ['Z'], 'all-heavy')).toHaveLength(0)
    })
  })

  describe('hydrogen filtering', () => {
    it('skips atoms whose name starts with H', () => {
      const atoms = parseAtoms(NOISY_PDB, ['A'], 'all-heavy')
      expect(atoms.every(a => !a.atomName.startsWith('H'))).toBe(true)
    })

    it('skips HA, HB2, etc. — all H-prefixed names', () => {
      const pdb = [
        makePdbLine('HA',  'A', 1, 0, 0, 0, 0, 1),
        makePdbLine('HB2', 'A', 1, 0, 0, 0, 0, 2),
        makePdbLine('CA',  'A', 1, 0, 0, 0, 0, 3),
      ].join('\n')
      const atoms = parseAtoms(pdb, ['A'], 'all-heavy')
      expect(atoms).toHaveLength(1)
      expect(atoms[0].atomName).toBe('CA')
    })

    it('skips D-prefixed atoms (deuterium)', () => {
      const pdb = [
        makePdbLine('DA', 'A', 1, 0, 0, 0, 0, 1),
        makePdbLine('CA', 'A', 1, 0, 0, 0, 0, 2),
      ].join('\n')
      const atoms = parseAtoms(pdb, ['A'], 'all-heavy')
      expect(atoms).toHaveLength(1)
    })
  })

  describe('backbone scope', () => {
    it('backbone mode keeps only N, CA, C, O', () => {
      const atoms = parseAtoms(CHAIN_A, ['A'], 'backbone')
      const names = atoms.map(a => a.atomName)
      expect(names.every(n => ['N', 'CA', 'C', 'O'].includes(n))).toBe(true)
    })

    it('backbone mode excludes sidechain atoms (CB, CG, etc.)', () => {
      const atoms = parseAtoms(CHAIN_A, ['A'], 'backbone')
      expect(atoms.some(a => a.atomName === 'CB')).toBe(false)
    })

    it('all-heavy mode keeps sidechain atoms', () => {
      const atoms = parseAtoms(CHAIN_A, ['A'], 'all-heavy')
      expect(atoms.some(a => a.atomName === 'CB')).toBe(true)
    })

    it('backbone gives subset of all-heavy for same input', () => {
      const bb  = parseAtoms(CHAIN_A, ['A'], 'backbone')
      const all = parseAtoms(CHAIN_A, ['A'], 'all-heavy')
      expect(bb.length).toBeLessThanOrEqual(all.length)
    })
  })

  describe('record type handling', () => {
    it('parses HETATM records as well as ATOM', () => {
      // parseAtoms accepts both ATOM and HETATM
      const pdb = 'HETATM    1  CA  LIG A   1      10.000  10.000  10.000  1.00 50.00           C'
      const atoms = parseAtoms(pdb, ['A'], 'all-heavy')
      expect(atoms).toHaveLength(1)
    })

    it('skips REMARK, SEQRES, and other non-ATOM/HETATM records', () => {
      const pdb = [
        'REMARK this is a comment',
        'SEQRES   1 A    3  ALA GLY VAL',
        makePdbLine('CA', 'A', 1, 0, 0, 0),
      ].join('\n')
      const atoms = parseAtoms(pdb, ['A'], 'all-heavy')
      expect(atoms).toHaveLength(1)
    })

    it('skips lines with NaN coordinates', () => {
      // Manually crafted line with non-numeric x
      const badLine = 'ATOM      1  CA  ALA A   1      BAD.    10.000  10.000  1.00 50.00           C'
      expect(parseAtoms(badLine, ['A'], 'all-heavy')).toHaveLength(0)
    })
  })
})
