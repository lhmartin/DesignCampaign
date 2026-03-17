import { describe, it, expect } from 'vitest'
import { getFileStem, getFileFormat, formatFileSize } from '@/lib/utils'

describe('getFileStem', () => {
  it('strips a single extension', () => {
    expect(getFileStem('protein.pdb')).toBe('protein')
  })

  it('strips only the last extension when multiple dots present', () => {
    expect(getFileStem('design.v2.cif')).toBe('design.v2')
  })

  it('handles Unix absolute path', () => {
    expect(getFileStem('/home/user/structures/protein.pdb')).toBe('protein')
  })

  it('handles Windows-style path with backslashes', () => {
    expect(getFileStem('C:\\Users\\data\\protein.pdb')).toBe('protein')
  })

  it('handles mixed separators', () => {
    expect(getFileStem('/some/path\\protein.pdb')).toBe('protein')
  })

  it('returns name unchanged if no extension', () => {
    expect(getFileStem('protein')).toBe('protein')
  })

  it('handles filenames with dots but no slash', () => {
    expect(getFileStem('my.protein.model.pdb')).toBe('my.protein.model')
  })
})

describe('getFileFormat', () => {
  it('returns "mmcif" for .cif extension', () => {
    expect(getFileFormat('structure.cif')).toBe('mmcif')
  })

  it('returns "mmcif" for .mmcif extension', () => {
    // Note: the implementation checks only .cif, so .mmcif also ends in .cif
    expect(getFileFormat('structure.mmcif')).toBe('mmcif')
  })

  it('returns "pdb" for .pdb extension', () => {
    expect(getFileFormat('structure.pdb')).toBe('pdb')
  })

  it('is case-insensitive for .pdb', () => {
    expect(getFileFormat('structure.PDB')).toBe('pdb')
  })

  it('is case-insensitive for .cif', () => {
    expect(getFileFormat('structure.CIF')).toBe('mmcif')
  })

  it('returns "pdb" for unknown extension (fallback)', () => {
    expect(getFileFormat('structure.xyz')).toBe('pdb')
  })

  it('handles full path correctly', () => {
    expect(getFileFormat('/home/user/protein.cif')).toBe('mmcif')
  })
})

describe('formatFileSize', () => {
  it('formats 0 bytes', () => {
    expect(formatFileSize(0)).toBe('0 B')
  })

  it('formats bytes below 1 KB', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(1023)).toBe('1023 B')
  })

  it('formats exactly 1 KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB')
  })

  it('formats values in KB range', () => {
    expect(formatFileSize(1536)).toBe('1.5 KB')
    expect(formatFileSize(102400)).toBe('100.0 KB')
  })

  it('formats exactly 1 MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB')
  })

  it('formats values in MB range', () => {
    expect(formatFileSize(1024 * 1024 * 2.5)).toBe('2.5 MB')
  })
})
