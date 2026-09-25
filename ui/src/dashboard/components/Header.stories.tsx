import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { sessionRuns } from '../../stories/fixtures'
import { Header } from './Header'

const meta: Meta<typeof Header> = {
  title: 'Dashboard/Header',
  component: Header,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="min-h-[360px] bg-theme-bg"><Story /></div>],
  args: {
    sessionName: 'support-agent',
    runName: 'baseline',
    runId: 'a1b2c3d4',
    sessionRuns,
    reloading: false,
    runState: 'idle',
    selectedCount: 0,
    onRename: fn(), onRenameRun: fn(), onDeleteRun: fn(), onSelectRun: fn(), onNewRun: fn(), onCompare: fn(), onExitCompare: fn(),
    onOpenSettings: fn(), onRegrade: fn(), onReloadServer: fn(), onRun: fn(), onStop: fn(), onPauseToggle: fn(),
  },
}
export default meta
type Story = StoryObj<typeof Header>

export const Idle: Story = {}
export const WithSelection: Story = { args: { selectedCount: 3 } }
export const Running: Story = { args: { runState: 'running' } }
export const Paused: Story = { args: { runState: 'paused' } }
export const OnlyRun: Story = { args: { sessionRuns: [sessionRuns[1]] } }
export const Comparing: Story = { args: { comparingCount: 3 } }

export const CompareMenu: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByLabelText('Compare runs'))
    await userEvent.click(await page.findByText('gpt-5-mini'))
    await expect(args.onCompare).toHaveBeenCalledWith('f0e1d2c3')
  },
}

export const MoreActions: Story = {
  args: { selectedCount: 3 },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByLabelText('More actions'))
    await expect(await within(canvasElement).findByText('Regrade 3 selected')).toBeVisible()
  },
}
