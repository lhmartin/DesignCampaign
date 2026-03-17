/**
 * Integration tests using real RCSB PDB structures.
 * Requires pre-downloaded fixtures in src/__tests__/fixtures/pdbs/.
 *
 * Download script (run once):
 *   cd src/__tests__/fixtures/pdbs
 *   for id in 1JRH 3HFM 1HEZ; do
 *     curl -L -s -o ${id}.pdb https://files.rcsb.org/download/${id}.pdb
 *   done
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { extractMetricsFromPDB } from '@/lib/parsers/pdb-metrics'
import { parseAtoms } from '@/lib/parsers/parse-atoms'
import { computeContacts } from '@/lib/interface-calc'

const pdbDir = path.resolve(__dirname, '../fixtures/pdbs')
const hasFixtures = existsSync(path.join(pdbDir, '3HFM.pdb'))

const describeIfFixtures = hasFixtures ? describe : describe.skip

// ─── 3HFM: HyHEL-10 Fab + Lysozyme ──────────────────────────────────────────

describeIfFixtures('3HFM — HyHEL-10 Fab + Lysozyme (H+L vs Y)', () => {
  const pdb = hasFixtures ? readFileSync(path.join(pdbDir, '3HFM.pdb'), 'utf-8') : ''

  it('has exactly 3 chains (H, L, Y)', () => {
    const m = extractMetricsFromPDB(pdb)
    expect(m.chain_count).toBe(3)
  })

  it('has > 400 total residues', () => {
    const m = extractMetricsFromPDB(pdb)
    expect(m.num_residues).toBeGreaterThan(400)
  })

  it('mean_plddt is a reasonable B-factor (> 0, < 150)', () => {
    const m = extractMetricsFromPDB(pdb)
    expect(m.mean_plddt).toBeGreaterThan(0)
    expect(m.mean_plddt).toBeLessThan(150)
  })

  it('detects a non-trivial interface at 6Å cutoff', () => {
    const binder = parseAtoms(pdb, ['H', 'L'], 'all-heavy')
    const target = parseAtoms(pdb, ['Y'], 'all-heavy')
    expect(binder.length).toBeGreaterThan(500)
    expect(target.length).toBeGreaterThan(100)

    const { paratope, epitope, nContacts } = computeContacts(binder, target, 6)
    expect(paratope.size).toBeGreaterThan(5)
    expect(epitope.size).toBeGreaterThan(5)
    expect(nContacts).toBeGreaterThan(50)
  })

  it('backbone-only scope gives a subset of all-heavy contacts', () => {
    const binderBB  = parseAtoms(pdb, ['H', 'L'], 'backbone')
    const targetBB  = parseAtoms(pdb, ['Y'], 'backbone')
    const binderAll = parseAtoms(pdb, ['H', 'L'], 'all-heavy')
    const targetAll = parseAtoms(pdb, ['Y'], 'all-heavy')

    const bbResult  = computeContacts(binderBB, targetBB, 6)
    const allResult = computeContacts(binderAll, targetAll, 6)

    // Backbone atoms are a strict subset of all heavy atoms
    expect(binderBB.length).toBeLessThan(binderAll.length)
    // Backbone contacts ≤ all-heavy contacts
    expect(bbResult.paratope.size).toBeLessThanOrEqual(allResult.paratope.size)
    expect(bbResult.nContacts).toBeLessThan(allResult.nContacts)
  })

  it('increasing cutoff 6→8Å never removes residues from the interface', () => {
    const binder = parseAtoms(pdb, ['H', 'L'], 'all-heavy')
    const target = parseAtoms(pdb, ['Y'], 'all-heavy')
    const r6 = computeContacts(binder, target, 6)
    const r8 = computeContacts(binder, target, 8)

    // Every residue in the 6Å paratope must also appear in the 8Å paratope
    for (const key of r6.paratope) expect(r8.paratope.has(key)).toBe(true)
    for (const key of r6.epitope)  expect(r8.epitope.has(key)).toBe(true)
    expect(r8.paratope.size).toBeGreaterThanOrEqual(r6.paratope.size)
  })

  it('swapping binder/target does NOT produce the same paratope/epitope', () => {
    // The interface is asymmetric — H+L residues ≠ Y residues
    const binderHL = parseAtoms(pdb, ['H', 'L'], 'all-heavy')
    const targetY  = parseAtoms(pdb, ['Y'], 'all-heavy')
    const r1 = computeContacts(binderHL, targetY, 6)
    const r2 = computeContacts(targetY, binderHL, 6)
    // After swap: r2.paratope = Y residues, r2.epitope = H+L residues
    // r1.paratope (H+L chains) ≠ r2.paratope (Y chains)
    const r1Keys = Array.from(r1.paratope).sort().join(',')
    const r2Keys = Array.from(r2.paratope).sort().join(',')
    expect(r1Keys).not.toBe(r2Keys)
    // But the sets are mirrors: r1.paratope = r2.epitope
    expect(Array.from(r1.paratope).sort().join(','))
      .toBe(Array.from(r2.epitope).sort().join(','))
  })
})

// ─── 1JRH: Anti-IL8 antibody + IL-8 ─────────────────────────────────────────

describeIfFixtures('1JRH — Anti-IL8 Ab + IL-8 (H+L vs I)', () => {
  const pdb = hasFixtures ? readFileSync(path.join(pdbDir, '1JRH.pdb'), 'utf-8') : ''

  it('has correct chain layout (H, L, I present)', () => {
    // Check that we get atoms from each expected chain
    const chainH = parseAtoms(pdb, ['H'], 'all-heavy')
    const chainL = parseAtoms(pdb, ['L'], 'all-heavy')
    const chainI = parseAtoms(pdb, ['I'], 'all-heavy')
    expect(chainH.length).toBeGreaterThan(0)
    expect(chainL.length).toBeGreaterThan(0)
    expect(chainI.length).toBeGreaterThan(0)
  })

  it('detects an interface between antibody (H+L) and IL-8 (I) at 6Å', () => {
    const binder = parseAtoms(pdb, ['H', 'L'], 'all-heavy')
    const target = parseAtoms(pdb, ['I'], 'all-heavy')
    const { paratope, epitope } = computeContacts(binder, target, 6)
    expect(paratope.size).toBeGreaterThan(3)
    expect(epitope.size).toBeGreaterThan(3)
  })
})
