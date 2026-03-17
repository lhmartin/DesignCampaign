import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MetricsTable } from '@/components/metrics/MetricsTable'
import { useMetricsStore } from '@/stores/metrics-store'
import { useFileStore } from '@/stores/file-store'
import type { MolstarViewerHandle } from '@/components/viewer/MolstarViewer'
import type { RefObject } from 'react'

// Stable mock ref — null means no viewer loaded (fine for these tests)
const mockViewerRef = { current: null } as RefObject<MolstarViewerHandle | null>

beforeEach(() => {
  useMetricsStore.getState().clearAll()
  useFileStore.setState({ files: [], currentFolder: null, activeFile: null })
  localStorage.clear()
})

describe('MetricsTable', () => {
  describe('empty states', () => {
    it('shows "Open a folder" placeholder when no files and no rows', () => {
      render(<MetricsTable viewerRef={mockViewerRef} />)
      expect(screen.getByText(/Open a folder to calculate metrics/i)).toBeInTheDocument()
    })

    it('shows "Click Calculate All" when files exist but no rows', () => {
      useFileStore.setState({
        files: [{ name: 'p.pdb', path: '/p.pdb', size: 100, mtime: 0 }],
        currentFolder: '/',
        activeFile: null,
      })
      render(<MetricsTable viewerRef={mockViewerRef} />)
      // The placeholder text contains the string "Calculate All"; the button also says
      // "Calculate All" — use the full placeholder phrase to be unambiguous.
      expect(screen.getByText(/Click "Calculate All" or import/i)).toBeInTheDocument()
    })

    it('"Calculate All" button is disabled when no files are loaded', () => {
      render(<MetricsTable viewerRef={mockViewerRef} />)
      const btn = screen.getByRole('button', { name: /Calculate All/i })
      expect(btn).toBeDisabled()
    })
  })

  describe('with data', () => {
    beforeEach(() => {
      useMetricsStore.getState().importCSV('name,mean_plddt,chain_count\nprotein1,75.0,2\nprotein2,80.0,3')
    })

    it('renders row data in the table', () => {
      render(<MetricsTable viewerRef={mockViewerRef} />)
      expect(screen.getByText('protein1')).toBeInTheDocument()
      expect(screen.getByText('protein2')).toBeInTheDocument()
    })

    it('shows correct row count in status bar', () => {
      render(<MetricsTable viewerRef={mockViewerRef} />)
      expect(screen.getByText(/2 of 2 rows/i)).toBeInTheDocument()
    })

    it('status bar message includes load instruction', () => {
      render(<MetricsTable viewerRef={mockViewerRef} />)
      expect(screen.getByText(/double-click row to load/i)).toBeInTheDocument()
    })
  })

  describe('column visibility', () => {
    beforeEach(() => {
      useMetricsStore.getState().importCSV('name,mean_plddt\nprotein1,75')
    })

    it('renders the Columns dropdown button', () => {
      render(<MetricsTable viewerRef={mockViewerRef} />)
      expect(screen.getByRole('button', { name: /Columns/i })).toBeInTheDocument()
    })

    it('opens the columns dropdown on click', async () => {
      const user = userEvent.setup()
      render(<MetricsTable viewerRef={mockViewerRef} />)
      await user.click(screen.getByRole('button', { name: /Columns/i }))
      // mean_plddt column should be listed in the dropdown
      expect(screen.getAllByText(/mean_plddt|pLDDT/i).length).toBeGreaterThan(0)
    })
  })

  describe('name cell rename', () => {
    beforeEach(() => {
      useMetricsStore.getState().importCSV('name,mean_plddt\nold_name,75')
    })

    it('double-clicking name cell shows a text input', async () => {
      const user = userEvent.setup()
      render(<MetricsTable viewerRef={mockViewerRef} />)
      const nameSpan = screen.getByTitle('Double-click to rename')
      await user.dblClick(nameSpan)
      expect(screen.getByDisplayValue('old_name')).toBeInTheDocument()
    })

    it('pressing Escape cancels the rename', async () => {
      const user = userEvent.setup()
      render(<MetricsTable viewerRef={mockViewerRef} />)
      await user.dblClick(screen.getByTitle('Double-click to rename'))
      const input = screen.getByDisplayValue('old_name')
      await user.clear(input)
      await user.type(input, 'new_name')
      await user.keyboard('{Escape}')
      // Should revert to original name
      expect(screen.getByText('old_name')).toBeInTheDocument()
    })

    it('pressing Enter commits the rename', async () => {
      const user = userEvent.setup()
      render(<MetricsTable viewerRef={mockViewerRef} />)
      await user.dblClick(screen.getByTitle('Double-click to rename'))
      const input = screen.getByDisplayValue('old_name')
      await user.clear(input)
      await user.type(input, 'renamed')
      await user.keyboard('{Enter}')
      expect(screen.getByText('renamed')).toBeInTheDocument()
      expect(useMetricsStore.getState().rows[0].name).toBe('renamed')
    })
  })

  describe('filter text', () => {
    beforeEach(() => {
      useMetricsStore.getState().importCSV('name,score\nalpha,80\nbeta,70\ngamma,60')
    })

    it('typing in the filter input reduces visible rows', async () => {
      const user = userEvent.setup()
      render(<MetricsTable viewerRef={mockViewerRef} />)
      const filterInput = screen.getByPlaceholderText(/Filter by name/i)
      await user.type(filterInput, 'alpha')
      expect(screen.getByText(/1 of 3 rows/i)).toBeInTheDocument()
      expect(screen.getByText('alpha')).toBeInTheDocument()
      expect(screen.queryByText('beta')).not.toBeInTheDocument()
    })
  })
})
