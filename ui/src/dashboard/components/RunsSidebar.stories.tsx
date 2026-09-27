import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { sessionRuns } from '../../stories/fixtures'
import { RunsSidebar } from './RunsSidebar'

const meta: Meta<typeof RunsSidebar> = {
  title: 'Dashboard/RunsSidebar',
  component: RunsSidebar,
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div className="flex h-[560px] bg-canvas"><Story /></div>],
  args: {
    sessionName: 'model-upgrade',
    runs: sessionRuns,
    activeRunId: 'a1b2c3d4',
    running: false,
    comparing: false,
    reloading: false,
    onSelectRun: fn(), onNewRun: fn(), onCompare: fn(), onRenameRun: fn(), onDeleteRun: fn(), onReload: fn(), onOpenSettings: fn(),
  },
}
export default meta
type Story = StoryObj<typeof RunsSidebar>

export const Default: Story = {}
export const Running: Story = { args: { running: true } }

/** A new run is listed before it has results (and a run file). */
export const NotRunYet: Story = {
  args: { runs: [{ run_id: 'b9c8d7e6', run_name: 'proud-shadow' }, ...sessionRuns], activeRunId: 'b9c8d7e6' },
  play: async ({ canvasElement }) => {
    const current = within(canvasElement).getByRole('button', { current: 'page' })
    await expect(current).toHaveTextContent('proud-shadow')
    await expect(current).toHaveTextContent('Not run yet')
  },
}

export const OpenAnotherRun: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByText('improved'))
    await expect(args.onSelectRun).toHaveBeenCalledWith('e5f6a7b8')
  },
}

/** A run's ⋯ menu compares it with the open run, renames, copies or deletes it. */
export const CompareFromMenu: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: 'gpt-5-mini actions' }))
    await expect(await page.findByRole('menuitem', { name: /Compare with this run/ })).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect(args.onCompare).toHaveBeenCalledWith('f0e1d2c3')
  },
}

export const RenameFromMenu: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: 'improved actions' }))
    await userEvent.click(await page.findByRole('menuitem', { name: /Rename/ }))
    const field = page.getByLabelText('Run name')
    await userEvent.clear(field)
    await userEvent.type(field, 'improved-v2{Enter}')
    await expect(args.onRenameRun).toHaveBeenCalledWith('e5f6a7b8', 'improved-v2')
  },
}

/** The open run can't be deleted; another run can, after confirming. */
export const DeleteRun: Story = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    await userEvent.click(page.getByRole('button', { name: 'baseline actions' }))
    await expect(await page.findByRole('menuitem', { name: /Delete run/ })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    window.confirm = () => true
    await userEvent.click(page.getByRole('button', { name: 'improved actions' }))
    await userEvent.click(await page.findByRole('menuitem', { name: /Delete run/ }))
    await expect(args.onDeleteRun).toHaveBeenCalledWith('e5f6a7b8')
  },
}
