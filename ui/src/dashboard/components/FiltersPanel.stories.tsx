import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import type { FilterState } from '../../types'
import { defaultFilters } from '../../lib/filters'
import { FiltersPanel } from './FiltersPanel'

const meta: Meta<typeof FiltersPanel> = {
  title: 'Dashboard/FiltersPanel',
  component: FiltersPanel,
  args: {
    scoreKeys: { pass: { numeric: false, passed: true }, helpfulness: { numeric: true, passed: false } },
    datasets: ['smalltalk', 'support', 'tools'],
    labels: ['production', 'regression'],
  },
  // Stateful, so the panel can be clicked through.
  render: function Render(args) {
    const [filters, setFilters] = useState<FilterState>(args.filters)
    return <div className="w-80 rounded border border-theme-border bg-theme-bg-secondary text-xs"><FiltersPanel {...args} filters={filters} onChange={setFilters} /></div>
  },
}
export default meta
type Story = StoryObj<typeof FiltersPanel>

export const NoFilters: Story = { args: { filters: defaultFilters() } }
export const Active: Story = {
  args: {
    filters: {
      ...defaultFilters(),
      annotation: 'yes',
      hasError: false,
      selectedDatasets: { include: ['support'], exclude: ['smalltalk'] },
      selectedLabels: { include: ['production'], exclude: [] },
      valueRules: [{ key: 'helpfulness', op: '>=', value: 0.8 }],
      passedRules: [{ key: 'pass', value: false }],
    },
  },
}
export const NoScores: Story = { args: { filters: defaultFilters(), scoreKeys: {}, datasets: [], labels: [] } }

export const CyclePill: Story = {
  args: { filters: defaultFilters() },
  play: async ({ canvasElement }) => {
    const pill = within(canvasElement).getByTitle('support')
    await userEvent.click(pill)
    await expect(within(canvasElement).getByText('support', { selector: '#active-filters *' })).toBeVisible()
    await userEvent.click(pill)
    await expect(within(canvasElement).getByText('not support')).toBeVisible()
  },
}
