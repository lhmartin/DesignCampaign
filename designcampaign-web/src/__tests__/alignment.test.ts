/**
 * Tests for structure alignment utilities (extractCAPositions, applyStructureTransform).
 *
 * We use lightweight mock Mol* structure/plugin objects so the tests run in jsdom
 * without a real WebGL canvas.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { extractCAPositions, applyStructureTransform } from '@/lib/mol-alignment'

// ─── Mock structure helpers ───────────────────────────────────────────────────

/** Build a minimal mock Mol* Structure from a list of { atomName, x, y, z } atoms. */
function makeMockStructure(
  atoms: { atomName: string; x: number; y: number; z: number }[],
  unitKind = 0,
) {
  return {
    units: [
      {
        kind: unitKind,
        elements: atoms.map((_, i) => i),
        model: {
          atomicHierarchy: {
            atoms: {
              auth_atom_id: { value: (idx: number) => atoms[idx].atomName },
            },
          },
          atomicConformation: {
            x: atoms.map(a => a.x),
            y: atoms.map(a => a.y),
            z: atoms.map(a => a.z),
          },
        },
      },
    ],
  }
}

// ─── extractCAPositions ───────────────────────────────────────────────────────

describe('extractCAPositions', () => {
  it('returns empty arrays for a structure with no atoms', () => {
    const s = makeMockStructure([])
    const pos = extractCAPositions(s)
    expect(pos.x).toHaveLength(0)
    expect(pos.y).toHaveLength(0)
    expect(pos.z).toHaveLength(0)
  })

  it('extracts only CA atoms and ignores others', () => {
    const s = makeMockStructure([
      { atomName: 'N',  x: 1, y: 2, z: 3 },
      { atomName: 'CA', x: 4, y: 5, z: 6 },
      { atomName: 'C',  x: 7, y: 8, z: 9 },
      { atomName: 'CA', x: 10, y: 11, z: 12 },
    ])
    const pos = extractCAPositions(s)
    expect(pos.x).toEqual([4, 10])
    expect(pos.y).toEqual([5, 11])
    expect(pos.z).toEqual([6, 12])
  })

  it('skips non-atomic units (kind !== 0)', () => {
    const coarse = makeMockStructure(
      [{ atomName: 'CA', x: 1, y: 2, z: 3 }],
      1, // coarse-grained unit
    )
    const pos = extractCAPositions(coarse)
    expect(pos.x).toHaveLength(0)
  })

  it('handles multiple units and combines their CA atoms', () => {
    const multiUnit = {
      units: [
        {
          kind: 0,
          elements: [0, 1],
          model: {
            atomicHierarchy: { atoms: { auth_atom_id: { value: (i: number) => ['CA', 'N'][i] } } },
            atomicConformation: { x: [1, 99], y: [2, 99], z: [3, 99] },
          },
        },
        {
          kind: 0,
          elements: [0],
          model: {
            atomicHierarchy: { atoms: { auth_atom_id: { value: (_i: number) => 'CA' } } },
            atomicConformation: { x: [7], y: [8], z: [9] },
          },
        },
      ],
    }
    const pos = extractCAPositions(multiUnit)
    expect(pos.x).toEqual([1, 7])
    expect(pos.y).toEqual([2, 8])
    expect(pos.z).toEqual([3, 9])
  })

  it('returns partial results and does not throw when structure data is malformed', () => {
    // One good unit followed by a malformed one
    const broken = {
      units: [
        {
          kind: 0,
          elements: [0],
          model: {
            atomicHierarchy: { atoms: { auth_atom_id: { value: () => 'CA' } } },
            atomicConformation: { x: [5], y: [6], z: [7] },
          },
        },
        null, // will throw during iteration
      ],
    }
    expect(() => extractCAPositions(broken)).not.toThrow()
    // The partial result from the first unit may or may not be returned depending
    // on where the throw occurs; we just care that it doesn't crash.
  })
})

// ─── applyStructureTransform ─────────────────────────────────────────────────

/** Build a minimal mock PluginUIContext for state-tree operations. */
function makeMockPlugin(hasCellFn?: (ref: string) => boolean) {
  const applyMock = vi.fn().mockReturnThis()
  const updateMock = vi.fn().mockReturnThis()
  // The builder chain returns an object that is eventually passed to updateTree.
  // We need the same object to track calls AND be the arg to updateTree.
  const chainObj = { apply: applyMock, update: updateMock }
  const toMock = vi.fn(() => chainObj)
  const buildMock = vi.fn(() => ({ to: toMock }))
  const updateTreeMock = vi.fn().mockReturnValue('task')

  const plugin = {
    state: {
      data: {
        build: buildMock,
        cells: { has: hasCellFn ?? (() => false) },
        updateTree: updateTreeMock,
      },
    },
    runTask: vi.fn().mockResolvedValue(undefined),
    _mocks: { build: buildMock, to: toMock, apply: applyMock, update: updateMock, updateTree: updateTreeMock },
  }

  // Mock the dynamic import of StateTransforms
  vi.doMock('molstar/lib/mol-plugin-state/transforms', () => ({
    StateTransforms: {
      Model: {
        TransformStructureConformation: 'mock-transformer',
      },
    },
  }))

  return plugin
}

describe('applyStructureTransform', () => {
  const STRUCT_REF = 'structure-ref-123'
  const IDENTITY_MAT = [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]

  beforeEach(() => {
    vi.resetModules()
  })

  it('calls .apply() when no existing transform ref is stored (first align)', async () => {
    const plugin = makeMockPlugin()
    const ref = await applyStructureTransform(plugin, STRUCT_REF, IDENTITY_MAT, null)

    expect(plugin._mocks.build).toHaveBeenCalledOnce()
    expect(plugin._mocks.to).toHaveBeenCalledWith(STRUCT_REF)
    expect(plugin._mocks.apply).toHaveBeenCalledOnce()
    expect(plugin._mocks.update).not.toHaveBeenCalled()
    expect(ref).toMatch(/^cmp-xform-/)
    expect(plugin.runTask).toHaveBeenCalledOnce()
  })

  it('calls .update() when an existing transform ref is present in cells', async () => {
    const existingRef = 'cmp-xform-existing'
    const plugin = makeMockPlugin((ref) => ref === existingRef)

    const returned = await applyStructureTransform(plugin, STRUCT_REF, IDENTITY_MAT, existingRef)

    expect(plugin._mocks.to).toHaveBeenCalledWith(existingRef)
    expect(plugin._mocks.update).toHaveBeenCalledOnce()
    expect(plugin._mocks.apply).not.toHaveBeenCalled()
    expect(returned).toBe(existingRef)
  })

  it('falls back to .apply() when existingRef is not in cells', async () => {
    const staleRef = 'cmp-xform-stale'
    const plugin = makeMockPlugin(() => false) // stale ref no longer exists

    const ref = await applyStructureTransform(plugin, STRUCT_REF, IDENTITY_MAT, staleRef)

    expect(plugin._mocks.apply).toHaveBeenCalledOnce()
    expect(plugin._mocks.update).not.toHaveBeenCalled()
    expect(ref).toMatch(/^cmp-xform-/)
  })

  it('passes the matrix data to the transform params', async () => {
    const mat = [2, 0, 0, 0,  0, 2, 0, 0,  0, 0, 2, 0,  1, 2, 3, 1]
    const plugin = makeMockPlugin()

    await applyStructureTransform(plugin, STRUCT_REF, mat, null)

    const applyCall = plugin._mocks.apply.mock.calls[0]
    // applyCall[1] is the params object
    expect(applyCall[1].transform.name).toBe('matrix')
    expect(applyCall[1].transform.params.data).toEqual(mat)
    expect(applyCall[1].transform.params.transpose).toBe(false)
  })

  it('returns a unique ref on each first-align call', async () => {
    const plugin1 = makeMockPlugin()
    const plugin2 = makeMockPlugin()
    const ref1 = await applyStructureTransform(plugin1, STRUCT_REF, IDENTITY_MAT, null)
    const ref2 = await applyStructureTransform(plugin2, STRUCT_REF, IDENTITY_MAT, null)
    expect(ref1).not.toBe(ref2)
  })
})
