import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterPanel } from '@/components/filter/FilterPanel'
import { useFilterStore, type ResidueFilterRule } from '@/stores/filter-store'
import { useMetricsStore } from '@/stores/metrics-store'
import { useBatchInterfaceStore } from '@/stores/batch-interface-store'

beforeEach(() => {
  useFilterStore.getState().clearRules()
  useFilterStore.setState({ rankingMetrics: [], presets: [], rankingMode: 'weighted-sum' })
  useMetricsStore.getState().clearAll()
  useBatchInterfaceStore.getState().clear()
  localStorage.clear()
})

describe('FilterPanel', () => {
  it('renders without crashing', () => {
    render(<FilterPanel />)
    expect(screen.getByText('+ Metric')).toBeInTheDocument()
    expect(screen.getByText('+ Residue')).toBeInTheDocument()
  })

  it('"Clear all" button is absent when no rules exist', () => {
    render(<FilterPanel />)
    expect(screen.queryByText('Clear all')).not.toBeInTheDocument()
  })

  it('"+ Metric" adds a numeric rule and updates the store', async () => {
    const user = userEvent.setup()
    render(<FilterPanel />)
    await user.click(screen.getByText('+ Metric'))
    expect(useFilterStore.getState().rules).toHaveLength(1)
    expect(useFilterStore.getState().rules[0].type).toBe('numeric')
  })

  it('"+ Residue" adds a residue rule and updates the store', async () => {
    const user = userEvent.setup()
    render(<FilterPanel />)
    await user.click(screen.getByText('+ Residue'))
    expect(useFilterStore.getState().rules).toHaveLength(1)
    expect(useFilterStore.getState().rules[0].type).toBe('residue')
  })

  it('"Clear all" appears after a rule is added and fires clearRules()', async () => {
    const user = userEvent.setup()
    render(<FilterPanel />)
    await user.click(screen.getByText('+ Metric'))
    const clearBtn = screen.getByText('Clear all')
    expect(clearBtn).toBeInTheDocument()
    await user.click(clearBtn)
    expect(useFilterStore.getState().rules).toHaveLength(0)
  })

  it('residue rule row shows ⚠ warning when batch interface data is absent', async () => {
    const user = userEvent.setup()
    render(<FilterPanel />)
    await user.click(screen.getByText('+ Residue'))
    // ⚠ warning is visible because useBatchInterfaceStore.results is empty
    expect(screen.getByTitle('Run batch interface calculation first')).toBeInTheDocument()
  })

  it('residue rule ⚠ is absent when batch data is present', async () => {
    useBatchInterfaceStore.setState({
      results: { '/some.pdb': { paratope: ['A:42'], epitope: [], nHBonds: 0, nClashes: 0, paratopeProps: { charge: 0, hydrophobicity: 0, aromatic: 0, polar: 0, nonpolar: 0 }, epitopeProps: { charge: 0, hydrophobicity: 0, aromatic: 0, polar: 0, nonpolar: 0 } } },
    })
    const user = userEvent.setup()
    render(<FilterPanel />)
    await user.click(screen.getByText('+ Residue'))
    expect(screen.queryByTitle('Run batch interface calculation first')).not.toBeInTheDocument()
  })

  it('residue rule ANY/ALL toggle updates store mode', async () => {
    const user = userEvent.setup()
    useFilterStore.getState().addResidueRule()
    // Residue rule default mode = 'any', shown as 'ANY'
    render(<FilterPanel />)
    const modeBtn = screen.getByText('ANY')
    await user.click(modeBtn)
    const rule = useFilterStore.getState().rules[0] as ResidueFilterRule
    expect(rule.mode).toBe('all')
  })

  it('ranking mode toggle buttons update store', async () => {
    const user = userEvent.setup()
    render(<FilterPanel />)
    // Ranking section starts collapsed — open it first
    await user.click(screen.getByRole('button', { name: /ranking/i }))
    await user.click(screen.getByText('Rank sum'))
    expect(useFilterStore.getState().rankingMode).toBe('borda')
  })

  it('shows "Calculate or import metrics first" when no ranking metrics available', async () => {
    // Set allColumns to [] so syncRankingMetrics (called from useEffect) adds nothing
    useMetricsStore.setState({ allColumns: [] })
    const user = userEvent.setup()
    render(<FilterPanel />)
    // Ranking section starts collapsed — open it first
    await user.click(screen.getByRole('button', { name: /ranking/i }))
    expect(screen.getByText('Calculate or import metrics first.')).toBeInTheDocument()
  })

  it('"Apply Ranking" button is disabled when rows are empty', () => {
    // Button only renders when at least one metric is active — no rows → disabled
    useMetricsStore.getState().importCSV('name,score\np1,80')
    useFilterStore.getState().syncRankingMetrics(['score'])
    useFilterStore.getState().updateRankingMetric('score', { active: true })
    // Clear rows so the button is rendered but disabled
    useMetricsStore.setState({ rows: [] })
    render(<FilterPanel />)
    const applyBtn = screen.getByRole('button', { name: /Apply Ranking/i })
    expect(applyBtn).toBeDisabled()
  })

  it('"Apply Ranking" injects rank_score column when active metrics configured', async () => {
    const user = userEvent.setup()
    useMetricsStore.getState().importCSV('name,score\nA,10\nB,20\nC,15')
    useFilterStore.getState().syncRankingMetrics(['score'])
    useFilterStore.getState().updateRankingMetric('score', { active: true })
    render(<FilterPanel />)
    const applyBtn = screen.getByRole('button', { name: /Apply Ranking/i })
    await user.click(applyBtn)
    const rows = useMetricsStore.getState().rows
    expect(rows.every(r => r.metrics['rank_score'] !== undefined)).toBe(true)
  })
})
