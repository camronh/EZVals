import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { completedRows } from '../../stories/fixtures'
import { Sidebar } from './Sidebar'

const meta: Meta<typeof Sidebar> = {
  title: 'Detail/Sidebar',
  component: Sidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-[640px] w-80"><Story /></div>],
  args: {
    runId: 'a1b2c3d4',
    onSaveAnnotation: fn(async () => {}),
    onSaveScores: fn(async () => {}),
    onOpenMessages: fn(),
    onOpenTrace: fn(),
    onEditingChange: fn(),
  },
}
export default meta
type Story = StoryObj<typeof Sidebar>

export const Everything: Story = { args: { row: completedRows[0] } }
export const FailedScores: Story = { args: { row: completedRows[1] } }
export const StructuredResult: Story = { args: { row: completedRows[3] } }
export const Minimal: Story = { args: { row: { function: 'greeting', result: { status: 'completed', scores: [] } } } }

export const EditingScore: Story = {
  args: { row: completedRows[1] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getAllByTitle('Edit score')[0])
    await expect(await within(canvasElement).findByDisplayValue('Passed: false')).toBeVisible()
  },
}

export const EditingAnnotation: Story = {
  args: { row: completedRows[0] },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByTitle('Edit annotation'))
    await expect(within(canvasElement).getByText('cancel')).toBeVisible()
  },
}
