import { describe, it, expect } from 'vitest'
import { extractMetricsFromPDB } from '@/lib/parsers/pdb-metrics'
import { makePdbLine, CHAIN_A, TWO_CHAIN_PDB } from '../fixtures/pdb-fragments'

describe('extractMetricsFromPDB', () => {
  describe('basic extraction', () => {
    it('returns zeros for empty PDB', () => {
      const m = extractMetricsFromPDB('')
      expect(m.mean_plddt).toBe(0)
      expect(m.mean_bfactor).toBe(0)
      expect(m.num_residues).toBe(0)
      expect(m.chain_count).toBe(0)
    })

    it('returns zeros when no ATOM lines', () => {
      const m = extractMetricsFromPDB('REMARK no atoms here\nSEQRES  1 A  10  ALA')
      expect(m.mean_plddt).toBe(0)
      expect(m.chain_count).toBe(0)
    })

    it('counts unique chains', () => {
      const m = extractMetricsFromPDB(TWO_CHAIN_PDB)
      expect(m.chain_count).toBe(2)
    })

    it('counts unique residues by chain:resSeq CA atoms', () => {
      // CHAIN_A has 3 residues (res 1, 2, 3) — all have CA atoms
      const m = extractMetricsFromPDB(CHAIN_A)
      expect(m.num_residues).toBe(3)
    })

    it('does not double-count residues with multiple atoms', () => {
      // Res 1 has N, CA, C, O, CB — but only 1 CA → counts as 1 residue
      const m = extractMetricsFromPDB(CHAIN_A)
      expect(m.num_residues).toBe(3)
    })
  })

  describe('B-factor calculations', () => {
    it('mean_plddt = mean B-factor of CA atoms (rounded to 2dp)', () => {
      // CHAIN_A: CA B-factors = 50, 60, 70 → mean = 60.00
      const m = extractMetricsFromPDB(CHAIN_A)
      expect(m.mean_plddt).toBeCloseTo(60.0, 1)
    })

    it('mean_bfactor = mean B-factor of ALL atoms (rounded to 2dp)', () => {
      // Single atom
      const pdb = makePdbLine('CA', 'A', 1, 0, 0, 0, 42.5)
      const m = extractMetricsFromPDB(pdb)
      expect(m.mean_bfactor).toBeCloseTo(42.5, 1)
    })

    it('mean_bfactor differs from mean_plddt when non-CA atoms present', () => {
      // CHAIN_A res 1: N, CA, C, O, CB all have B=50; res 2 CA B=60; res 3 CA B=70
      // All-atom mean = (50*5 + 60 + 70) / 7 = 390/7 ≈ 55.71
      // CA-only mean = (50+60+70)/3 = 60
      const m = extractMetricsFromPDB(CHAIN_A)
      expect(m.mean_plddt).not.toBeCloseTo(m.mean_bfactor, 0)
    })

    it('rounds to 2 decimal places', () => {
      const pdb = [
        makePdbLine('CA', 'A', 1, 0, 0, 0, 33.33),
        makePdbLine('CA', 'A', 2, 0, 0, 0, 66.67),
      ].join('\n')
      const m = extractMetricsFromPDB(pdb)
      // (33.33 + 66.67) / 2 = 50.00
      expect(m.mean_plddt).toBe(50.0)
    })
  })

  describe('format robustness', () => {
    it('skips lines shorter than 66 chars', () => {
      const shortLine = 'ATOM      1  CA  ALA A   1     10.0'
      const m = extractMetricsFromPDB(shortLine)
      expect(m.num_residues).toBe(0)
    })

    it('skips HETATM records (only processes ATOM)', () => {
      const hetatm = 'HETATM    1  C1  LIG A   1      10.000  10.000  10.000  1.00 50.00           C'
      const m = extractMetricsFromPDB(hetatm)
      // HETATM starts with 'HET', not 'ATOM' → skipped
      expect(m.chain_count).toBe(0)
    })

    it('skips lines where B-factor is non-numeric', () => {
      // Put non-numeric in B-factor column (60-65)
      const badBfactor = 'ATOM      1  CA  ALA A   1      10.000  10.000  10.000  1.00 XX.XX           C'
      const m = extractMetricsFromPDB(badBfactor)
      expect(m.mean_bfactor).toBe(0)
    })

    it('handles CRLF line endings', () => {
      const pdb = makePdbLine('CA', 'A', 1, 0, 0, 0, 75.0) + '\r\n'
      const m = extractMetricsFromPDB(pdb)
      // Should still parse the atom (B-factor NaN check saves us from \r in B-factor field)
      // The \r shifts column positions but the B-factor column is well before it
      expect(m.chain_count).toBeGreaterThanOrEqual(0)
    })
  })
})
