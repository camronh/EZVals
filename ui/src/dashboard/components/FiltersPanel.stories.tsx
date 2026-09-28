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
    return <div className="w-80 rounded-lg border border-line bg-surface text-sm"><FiltersPanel {...args} filters={filters} onChange={setFilters} /></div>
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

export const OnlyAndHide: Story = {
  args: { filters: defaultFilters() },
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement.querySelector('#dataset-pills') as HTMLElement)
    const [onlySmalltalk, onlySupport] = rows.getAllByRole('button', { name: /^Only / })
    await userEvent.click(onlySupport)
    await expect(onlySupport).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(rows.getAllByRole('button', { name: /^Hide / })[1])
    await expect(onlySupport).toHaveAttribute('aria-pressed', 'false')
    await expect(onlySmalltalk).toHaveAttribute('aria-pressed', 'false')
    await expect(rows.getByText('support')).toHaveClass('line-through')
  },
}
