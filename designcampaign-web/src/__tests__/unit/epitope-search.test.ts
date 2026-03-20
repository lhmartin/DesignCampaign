import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchEpitopeContacts } from '@/lib/epitope-search'
import type { NamedSelection, EpitopeSearchParams } from '@/stores/named-selection-store'

// Mock hashSeq so tests don't require real SubtleCrypto and are fully deterministic.
// vi.hoisted ensures the ref is available when the hoisted vi.mock factory runs.
const mockHashSeq = vi.hoisted(() => vi.fn().mockResolvedValue('testhash'))
vi.mock('@/lib/hash-seq', () => ({ hashSeq: mockHashSeq }))

// ── PDB fixture builder ───────────────────────────────────────────────────────

/**
 * Build a single PDB ATOM line with the exact column layout expected by parseAtoms:
 *   chain   → line[21]
 *   resSeq  → line.slice(22, 26)
 *   atomName→ line.slice(12, 16)
 *   x/y/z   → line.slice(30,38) / slice(38,46) / slice(46,54)
 */
function atom(
  serial: number, atomName: string, resName: string,
  chain: string, resSeq: number, x: number, y: number, z: number,
): string {
  const an = atomName.length === 1 ? ` ${atomName}  `
           : atomName.length === 2 ? ` ${atomName} `
           : ` ${atomName}`.padEnd(4)
  const f = (n: number) => n.toFixed(3).padStart(8)
  return (
    'ATOM  ' +
    String(serial).padStart(5) + ' ' +
    an.slice(0, 4) + ' ' +
    resName.padEnd(3).slice(0, 3) + ' ' +
    chain +
    String(resSeq).padStart(4) + ' ' +
    '   ' +
    f(x) + f(y) + f(z)
  )
}

/**
 * Two-chain PDB:
 *   Chain A: ALA 1 at (0,0,0), ALA 2 at (10,0,0)
 *   Chain B: ALA 1 at (0,0,4.8)  ← within 5 Å of A:1 but not A:2
 *
 * Expected with cutoff=5.0, scope=ca:
 *   hitCount=1 (only A:1 contacted), totalCount=2, hitFraction=0.5
 */
const TWO_CHAIN_PDB = [
  atom(1, 'CA', 'ALA', 'A', 1,  0,  0, 0),
  atom(2, 'CA', 'ALA', 'A', 2, 10,  0, 0),
  atom(3, 'CA', 'ALA', 'B', 1,  0,  0, 4.8),
].join('\n')

// ── Shared fixtures ───────────────────────────────────────────────────────────

const BASE_SELECTION: NamedSelection = {
  id: 'sel1', name: 'Test', chainId: 'A', chainHash: 'testhash',
  residues: ['A:1', 'A:2'], color: 0x22c55e, visible: true,
}

const BASE_PARAMS: EpitopeSearchParams = {
  cutoff: 5.0, atomScope: 'ca', matchMode: 'any', matchValue: 1,
}

const SINGLE_FILE = [{ name: 'test.pdb', filePath: '/test.pdb' }]
const readTwoChain = async (_path: string) => TWO_CHAIN_PDB

beforeEach(() => { mockHashSeq.mockResolvedValue('testhash') })

// ── Tests ────────────────────────────────────────────────────────────────────

describe('searchEpitopeContacts', () => {

  describe('basic contact detection', () => {
    it('returns [] immediately when selection has no residues', async () => {
      const sel = { ...BASE_SELECTION, residues: [] }
      expect(await searchEpitopeContacts(sel, BASE_PARAMS, SINGLE_FILE, readTwoChain)).toEqual([])
    })

    it('detects a binder atom within cutoff and reports correct counts', async () => {
      const [hit] = await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, SINGLE_FILE, readTwoChain)
      expect(hit.hitCount).toBe(1)
      expect(hit.totalCount).toBe(2)
      expect(hit.hitFraction).toBeCloseTo(0.5)
      expect(hit.name).toBe('test.pdb')
    })

    it('returns no hit when binder is just beyond the cutoff', async () => {
      // B:1 at (0,0,5.1) → dist from A:1 = 5.1 > 5.0
      const farPdb = [
        atom(1, 'CA', 'ALA', 'A', 1,  0, 0, 0),
        atom(2, 'CA', 'ALA', 'A', 2, 10, 0, 0),
        atom(3, 'CA', 'ALA', 'B', 1,  0, 0, 5.1),
      ].join('\n')
      const hits = await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, SINGLE_FILE, async () => farPdb)
      expect(hits).toHaveLength(0)
    })
  })

  describe('matchMode', () => {
    // Scenario: hitCount=1, totalCount=2 (50% contacted)

    it('any — passes with at least one residue contacted', async () => {
      const hits = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, matchMode: 'any' }, SINGLE_FILE, readTwoChain)
      expect(hits).toHaveLength(1)
    })

    it('all — fails when only a subset of residues are contacted', async () => {
      const hits = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, matchMode: 'all' }, SINGLE_FILE, readTwoChain)
      expect(hits).toHaveLength(0)
    })

    it('all — passes when the entire selection is contacted', async () => {
      const sel = { ...BASE_SELECTION, residues: ['A:1'] } // only A:1, which is contacted
      const hits = await searchEpitopeContacts(sel, { ...BASE_PARAMS, matchMode: 'all' }, SINGLE_FILE, readTwoChain)
      expect(hits).toHaveLength(1)
    })

    it('count — passes when hitCount >= matchValue, fails otherwise', async () => {
      const pass = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, matchMode: 'count', matchValue: 1 }, SINGLE_FILE, readTwoChain)
      const fail = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, matchMode: 'count', matchValue: 2 }, SINGLE_FILE, readTwoChain)
      expect(pass).toHaveLength(1)
      expect(fail).toHaveLength(0)
    })

    it('percentage — passes when hitFraction×100 >= matchValue, fails otherwise', async () => {
      const pass = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, matchMode: 'percentage', matchValue: 50 }, SINGLE_FILE, readTwoChain)
      const fail = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, matchMode: 'percentage', matchValue: 51 }, SINGLE_FILE, readTwoChain)
      expect(pass).toHaveLength(1)
      expect(fail).toHaveLength(0)
    })
  })

  describe('chain matching', () => {
    it('skips a file when no chain hash matches the selection', async () => {
      mockHashSeq.mockResolvedValue('different_hash')
      const hits = await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, SINGLE_FILE, readTwoChain)
      expect(hits).toHaveLength(0)
    })

    it('skips a file that has no binder chains (single-chain PDB)', async () => {
      const singleChain = [
        atom(1, 'CA', 'ALA', 'A', 1, 0, 0, 0),
        atom(2, 'CA', 'ALA', 'A', 2, 10, 0, 0),
      ].join('\n')
      const hits = await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, SINGLE_FILE, async () => singleChain)
      expect(hits).toHaveLength(0)
    })
  })

  describe('atomScope filtering', () => {
    it('scope=ca excludes non-CA binder atoms', async () => {
      // Chain B: CB at (0,0,2) is very close, CA at (0,0,20) is far.
      // parseChainSequences uses CA fallback for chain detection, so chain B
      // needs at least one CA atom to be recognised as a binder chain.
      const mixedBinder = [
        atom(1, 'CA', 'ALA', 'A',  1,  0, 0,  0),
        atom(2, 'CA', 'ALA', 'A',  2, 10, 0,  0),
        atom(3, 'CB', 'ALA', 'B',  1,  0, 0,  2.0), // close non-CA
        atom(4, 'CA', 'ALA', 'B',  1,  0, 0, 20.0), // far CA — needed for chain detection
      ].join('\n')
      const readMixed = async () => mixedBinder
      const hitsCA    = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, atomScope: 'ca'        }, SINGLE_FILE, readMixed)
      const hitsHeavy = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, atomScope: 'all-heavy' }, SINGLE_FILE, readMixed)
      expect(hitsCA).toHaveLength(0)    // far CA excluded → no contact
      expect(hitsHeavy).toHaveLength(1) // close CB included → contact
    })

    it('scope=backbone excludes side-chain binder atoms', async () => {
      // CB is close (non-backbone); CA is far but present for chain detection.
      const sideChainBinder = [
        atom(1, 'CA', 'ALA', 'A', 1,  0, 0,  0),
        atom(2, 'CA', 'ALA', 'A', 2, 10, 0,  0),
        atom(3, 'CB', 'ALA', 'B', 1,  0, 0,  2.0), // close CB, non-backbone
        atom(4, 'CA', 'ALA', 'B', 1,  0, 0, 20.0), // far CA, backbone but too far
      ].join('\n')
      const readScb = async () => sideChainBinder
      const hitsBackbone = await searchEpitopeContacts(BASE_SELECTION, { ...BASE_PARAMS, atomScope: 'backbone' }, SINGLE_FILE, readScb)
      expect(hitsBackbone).toHaveLength(0) // CB excluded; only far CA remains → no contact
    })
  })

  describe('multi-file handling', () => {
    it('calls onProgress once per file with correct (done, total) args', async () => {
      const files = [
        { name: 'a.pdb', filePath: '/a.pdb' },
        { name: 'b.pdb', filePath: '/b.pdb' },
      ]
      const progress = vi.fn()
      await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, files, async () => TWO_CHAIN_PDB, progress)
      expect(progress).toHaveBeenCalledTimes(2)
      expect(progress).toHaveBeenNthCalledWith(1, 1, 2)
      expect(progress).toHaveBeenNthCalledWith(2, 2, 2)
    })

    it('skips a file that throws from readFile without propagating the error', async () => {
      const files = [
        { name: 'bad.pdb',  filePath: '/bad.pdb'  },
        { name: 'good.pdb', filePath: '/good.pdb' },
      ]
      const read = async (p: string) => {
        if (p === '/bad.pdb') throw new Error('ENOENT')
        return TWO_CHAIN_PDB
      }
      const hits = await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, files, read)
      expect(hits).toHaveLength(1)
      expect(hits[0].name).toBe('good.pdb')
    })

    it('evaluates each file independently', async () => {
      const noContactPdb = [
        atom(1, 'CA', 'ALA', 'A', 1,  0, 0, 0),
        atom(2, 'CA', 'ALA', 'A', 2, 10, 0, 0),
        atom(3, 'CA', 'ALA', 'B', 1,  0, 0, 9.0), // beyond cutoff
      ].join('\n')
      const files = [
        { name: 'hit.pdb',  filePath: '/hit.pdb'  },
        { name: 'miss.pdb', filePath: '/miss.pdb' },
      ]
      const read = async (p: string) => p === '/hit.pdb' ? TWO_CHAIN_PDB : noContactPdb
      const hits = await searchEpitopeContacts(BASE_SELECTION, BASE_PARAMS, files, read)
      expect(hits).toHaveLength(1)
      expect(hits[0].name).toBe('hit.pdb')
    })
  })
})
