import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileContent } from '@/lib/fsa'

// Minimal ElectronAPI mock — only the methods readFileContent touches
function makeElectronAPIMock(overrides: Partial<typeof window.electronAPI> = {}) {
  return {
    readFile: vi.fn().mockResolvedValue('local file contents'),
    cloudReadFile: vi.fn().mockResolvedValue('cloud file contents'),
    ...overrides,
  } as unknown as typeof window.electronAPI
}

beforeEach(() => {
  window.electronAPI = undefined as unknown as typeof window.electronAPI
})

afterEach(() => {
  window.electronAPI = undefined as unknown as typeof window.electronAPI
})

describe('readFileContent — cloud routing', () => {
  it('calls cloudReadFile for cloud:// paths when electronAPI is present', async () => {
    const api = makeElectronAPIMock()
    window.electronAPI = api

    const result = await readFileContent('cloud://azure/conn_abc123/protein.pdb')
    expect(api.cloudReadFile).toHaveBeenCalledWith('cloud://azure/conn_abc123/protein.pdb')
    expect(api.readFile).not.toHaveBeenCalled()
    expect(result).toBe('cloud file contents')
  })

  it('calls readFile for local paths when electronAPI is present', async () => {
    const api = makeElectronAPIMock()
    window.electronAPI = api

    const result = await readFileContent('/home/user/structures/protein.pdb')
    expect(api.readFile).toHaveBeenCalledWith('/home/user/structures/protein.pdb')
    expect(api.cloudReadFile).not.toHaveBeenCalled()
    expect(result).toBe('local file contents')
  })

  it('throws when no electronAPI and no FSA dirHandle (cloud path)', async () => {
    // electronAPI is undefined (set in beforeEach); no __dirHandle either
    await expect(readFileContent('cloud://azure/conn_abc123/protein.pdb'))
      .rejects.toThrow()
  })
})
