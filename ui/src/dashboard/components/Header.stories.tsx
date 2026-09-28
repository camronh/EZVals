import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { sessionRuns } from '../../stories/fixtures'
import { Header } from './Header'

const meta: Meta<typeof Header> = {
  title: 'Dashboard/Header',
  component: Header,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="min-h-[240px] bg-surface"><Story /></div>],
  args: {
    runName: 'baseline',
    runId: 'a1b2c3d4',
    meta: '6 evals · Sep 24, 4:00 PM',
    sessionRuns,
    sidebarOpen: true,
    runState: 'idle',
    selectedCount: 0,
    canRegrade: true,
    onToggleSidebar: fn(), onRename: fn(), onCompare: fn(), onExitCompare: fn(), onRegrade: fn(), onRun: fn(), onStop: fn(), onPauseToggle: fn(),
  },
}
export default meta
type Story = StoryObj<typeof Header>

export const Idle: Story = {}
export const WithSelection: Story = { args: { selectedCount: 3 } }
export const Running: Story = { args: { runState: 'running' } }
export const Paused: Story = { args: { runState: 'paused' } }
/** With no other run in the session there is nothing to compare with, so Compare isn't shown. */
export const OnlyRun: Story = {
  args: { sessionRuns: [sessionRuns[1]] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: 'Compare runs' })).toBeNull()
  },
}
/** No finished result has a target to score again, so Regrade isn't shown. */
export const NothingToRegrade: Story = {
  args: { canRegrade: false },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('button', { name: /Regrade/ })).toBeNull()
  },
}
export const Comparing: Story = { args: { comparingCount: 3 } }
export const SidebarHidden: Story = { args: { sidebarOpen: false } }

export const CompareMenu: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByLabelText('Compare runs'))
    await userEvent.click(await page.findByText('gpt-5-mini'))
    await expect(args.onCompare).toHaveBeenCalledWith('f0e1d2c3')
  },
}

/** Rename in place: Enter saves, and the title shows the new name's field until then. */
export const Rename: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByLabelText('Rename run'))
    const field = canvas.getByLabelText('Run name')
    await userEvent.clear(field)
    await userEvent.type(field, 'baseline-v2{Enter}')
    await expect(args.onRename).toHaveBeenCalledWith('baseline-v2')
  },
}
