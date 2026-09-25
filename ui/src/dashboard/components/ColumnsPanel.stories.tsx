import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { COLUMN_KEYS, DEFAULT_HIDDEN_COLUMNS } from '../../lib/table'
import { ColumnsPanel } from './ColumnsPanel'

const meta: Meta<typeof ColumnsPanel> = {
  title: 'Dashboard/ColumnsPanel',
  component: ColumnsPanel,
  decorators: [(Story) => <div className="w-64 rounded border border-theme-border bg-theme-bg-secondary text-xs"><Story /></div>],
  args: { onHiddenChange: fn(), onSearchColumnsChange: fn(), onResetSort: fn(), onResetWidths: fn() },
}
export default meta
type Story = StoryObj<typeof ColumnsPanel>

export const Default: Story = { args: { hidden: DEFAULT_HIDDEN_COLUMNS, searchColumns: COLUMN_KEYS } }
export const Customized: Story = { args: { hidden: ['reference', 'latency'], searchColumns: ['function', 'output'] } }
