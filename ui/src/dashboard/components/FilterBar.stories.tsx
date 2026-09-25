import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { defaultFilters } from '../../lib/filters'
import { COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS } from '../../lib/table'
import { FilterBar } from './FilterBar'

const meta: Meta<typeof FilterBar> = {
  title: 'Dashboard/FilterBar',
  component: FilterBar,
  decorators: [(Story) => <div className="min-h-[520px] bg-theme-bg"><Story /></div>],
  args: {
    outcomeCounts: { all: 24, failed: 5, errors: 2 },
    search: '',
    filters: defaultFilters(),
    scoreKeys: { pass: { numeric: false, passed: true }, helpfulness: { numeric: true, passed: false } },
    datasets: ['smalltalk', 'support', 'tools'],
    labels: ['production', 'regression', 'tools'],
    hiddenColumns: DEFAULT_HIDDEN_COLUMNS,
    searchColumns: COLUMN_KEYS,
    selectedCount: 0,
    onSearch: fn(), onFilters: fn(), onHiddenColumns: fn(), onSearchColumns: fn(), onResetSort: fn(), onResetWidths: fn(), onExport: fn(), onClearSelection: fn(),
  },
}
export default meta
type Story = StoryObj<typeof FilterBar>

export const Default: Story = {}
export const ActiveFilters: Story = {
  args: { search: 'refund', filters: { ...defaultFilters(), outcome: 'failed', hasError: true, selectedDatasets: { include: ['support'], exclude: [] } } },
}
export const WithSelection: Story = { args: { selectedCount: 3 } }

export const ShowFailed: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole('radio', { name: /Failed/ }))
    await expect(args.onFilters).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }))
  },
}
export const FiltersOpen: Story = {
  args: ActiveFilters.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: /Filters/ }))
    await expect(await within(canvasElement).findByText('Dataset')).toBeVisible()
  },
}
export const ColumnsOpen: Story = { play: async ({ canvasElement }) => userEvent.click(within(canvasElement).getByRole('button', { name: 'Columns' })) }
export const ExportOpen: Story = { play: async ({ canvasElement }) => userEvent.click(within(canvasElement).getByRole('button', { name: 'Export' })) }
