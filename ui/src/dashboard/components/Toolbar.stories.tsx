import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { defaultFilters } from '../../lib/filters'
import { COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS } from '../../lib/table'
import { Toolbar } from './Toolbar'

const meta: Meta<typeof Toolbar> = {
  title: 'Dashboard/Toolbar',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="min-h-[520px] bg-theme-bg"><Story /></div>],
  args: {
    search: '',
    filters: defaultFilters(),
    scoreKeys: { pass: { numeric: false, passed: true }, helpfulness: { numeric: true, passed: false } },
    datasets: ['smalltalk', 'support', 'tools'],
    labels: ['production', 'regression', 'tools'],
    hiddenColumns: DEFAULT_HIDDEN_COLUMNS,
    searchColumns: COLUMN_KEYS,
    reloading: false,
    runState: 'idle',
    selectedCount: 0,
    onSearch: fn(), onFilters: fn(), onHiddenColumns: fn(), onSearchColumns: fn(), onResetSort: fn(), onResetWidths: fn(),
    onExport: fn(), onOpenSettings: fn(), onRegrade: fn(), onReloadServer: fn(), onRun: fn(), onStop: fn(), onPauseToggle: fn(),
  },
}
export default meta
type Story = StoryObj<typeof Toolbar>

export const Idle: Story = {}
export const Running: Story = { args: { runState: 'running' } }
export const Paused: Story = { args: { runState: 'paused' } }
export const CompareMode: Story = { args: { runState: 'compare' } }
export const ActiveFilters: Story = {
  args: { search: 'refund', filters: { ...defaultFilters(), hasError: true, selectedDatasets: { include: ['support'], exclude: [] }, valueRules: [{ key: 'helpfulness', op: '>=', value: 0.8 }] } },
}

export const FiltersOpen: Story = {
  args: ActiveFilters.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTitle('Filters'))
    await expect(await within(canvasElement).findByText('Dataset')).toBeVisible()
  },
}
export const ColumnsOpen: Story = { play: async ({ canvasElement }) => userEvent.click(within(canvasElement).getByTitle('Columns')) }
export const ExportOpen: Story = { play: async ({ canvasElement }) => userEvent.click(within(canvasElement).getByTitle('Export')) }
export const MoreActionsWithSelection: Story = {
  args: { selectedCount: 3 },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTitle('More actions'))
    await expect(await within(canvasElement).findByText('Regrade 3 selected')).toBeVisible()
  },
}
