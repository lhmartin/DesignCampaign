import { describe, it, expect } from 'vitest'
import { isCloudPath, parseCloudPath, buildCloudPath } from '@/lib/cloud-paths'

describe('isCloudPath', () => {
  it('returns true for azure cloud paths', () => {
    expect(isCloudPath('cloud://azure/conn_abc123/protein.pdb')).toBe(true)
  })

  it('returns true for gcs cloud paths', () => {
    expect(isCloudPath('cloud://gcs/conn_xyz789/batch/model.cif')).toBe(true)
  })

  it('returns false for local absolute paths', () => {
    expect(isCloudPath('/home/user/structures/protein.pdb')).toBe(false)
  })

  it('returns false for Windows-style paths', () => {
    expect(isCloudPath('C:\\Users\\data\\protein.pdb')).toBe(false)
  })

  it('returns false for empty string', () => {
    expect(isCloudPath('')).toBe(false)
  })

  it('returns false for paths that start with http', () => {
    expect(isCloudPath('https://account.blob.core.windows.net/container/file.pdb')).toBe(false)
  })
})

describe('parseCloudPath', () => {
  it('parses a flat azure blob path', () => {
    const result = parseCloudPath('cloud://azure/conn_abc123/protein.pdb')
    expect(result).toEqual({
      provider: 'azure',
      connectionId: 'conn_abc123',
      blobName: 'protein.pdb',
    })
  })

  it('parses a nested azure blob path (blob name contains slashes)', () => {
    const result = parseCloudPath('cloud://azure/conn_abc123/batch01/designs/protein_001.pdb')
    expect(result).toEqual({
      provider: 'azure',
      connectionId: 'conn_abc123',
      blobName: 'batch01/designs/protein_001.pdb',
    })
  })

  it('parses a gcs path', () => {
    const result = parseCloudPath('cloud://gcs/conn_xyz789/models/v2/target.cif')
    expect(result).toEqual({
      provider: 'gcs',
      connectionId: 'conn_xyz789',
      blobName: 'models/v2/target.cif',
    })
  })

  it('parses a json sidecar path', () => {
    const result = parseCloudPath('cloud://azure/conn_abc123/designs/protein_001.json')
    expect(result).toEqual({
      provider: 'azure',
      connectionId: 'conn_abc123',
      blobName: 'designs/protein_001.json',
    })
  })

  it('parses a connection folder path (no blobName segment)', () => {
    // currentFolder is stored as cloud://<provider>/<id> — no trailing blob name
    const result = parseCloudPath('cloud://azure/conn_abc123')
    expect(result).toEqual({
      provider: 'azure',
      connectionId: 'conn_abc123',
      blobName: '',
    })
  })
})

describe('buildCloudPath', () => {
  it('builds a flat azure cloud path', () => {
    expect(buildCloudPath('azure', 'conn_abc123', 'protein.pdb'))
      .toBe('cloud://azure/conn_abc123/protein.pdb')
  })

  it('builds a nested path preserving slashes in the blob name', () => {
    expect(buildCloudPath('gcs', 'conn_xyz789', 'batch/v2/model.cif'))
      .toBe('cloud://gcs/conn_xyz789/batch/v2/model.cif')
  })

  it('round-trips with parseCloudPath', () => {
    const original = 'cloud://azure/conn_abc123/batch01/protein.pdb'
    const { provider, connectionId, blobName } = parseCloudPath(original)
    expect(buildCloudPath(provider, connectionId, blobName)).toBe(original)
  })
})
