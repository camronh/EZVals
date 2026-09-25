import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import type { PreviewColumn } from './CellPreviewPopover'
import { completedRows } from '../../stories/fixtures'
import { CellPreviewPopover } from './CellPreviewPopover'

const target = (col: PreviewColumn, index: number, editing = false) => ({
  col, index, editing, runId: 'a1b2c3d4', result: completedRows[index].result, rect: new DOMRect(80, 40, 320, 24),
})

const meta: Meta<typeof CellPreviewPopover> = {
  title: 'Dashboard/CellPreviewPopover',
  component: CellPreviewPopover,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="h-[460px]"><Story /></div>],
  args: { onKeep: fn(), onClose: fn(), onSaveAnnotation: fn(async () => {}) },
}
export default meta
type Story = StoryObj<typeof CellPreviewPopover>

export const Output: Story = { args: { target: target('output', 5) } }
export const StructuredOutput: Story = { args: { target: { ...target('output', 3), result: { output: { status: 'shipped', eta: '2026-09-27', carrier: 'UPS', items: [{ sku: 'A-1', qty: 2 }, { sku: 'B-7', qty: 1 }] } } } } }
export const Scores: Story = { args: { target: target('scores', 1) } }
export const Error: Story = { args: { target: target('error', 4) } }
export const Annotation: Story = { args: { target: target('annotation', 0) } }
export const EditingAnnotation: Story = { args: { target: target('annotation', 0, true) } }
