import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import { expect, fn, userEvent, within } from 'storybook/test'
import { sessionRuns } from '../../stories/fixtures'
import { RunPicker } from './RunPicker'

const meta: Meta<typeof RunPicker> = {
  title: 'Dashboard/RunPicker',
  component: RunPicker,
  args: { sessionRuns, activeRunId: 'a1b2c3d4', onClose: fn(), onSelectRun: fn(), onRenameRun: fn(), onDeleteRun: fn() },
  render: function Render(args) {
    const anchor = useRef<HTMLButtonElement | null>(null)
    return (
      <div className="h-64">
        <button ref={anchor} className="btn">baseline</button>
        <RunPicker {...args} anchorRef={anchor} />
      </div>
    )
  },
}
export default meta

export const Default: StoryObj<typeof RunPicker> = {}

/** Arrow keys and hover move between runs (a scrollIntoView effect once broke the page); clicking a run opens it. */
export const KeyboardAndHover: StoryObj<typeof RunPicker> = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    const rows = await page.findAllByRole('listitem')
    await userEvent.hover(rows[1])
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')
    await expect(within(rows[1]).getAllByRole('button')[0]).toHaveFocus()
    await userEvent.click(within(rows[1]).getAllByRole('button')[0])
    await expect(args.onSelectRun).toHaveBeenCalledWith(rows[1].dataset.runId)
  },
}

export const DeleteRun: StoryObj<typeof RunPicker> = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    const deletes = await page.findAllByRole('button', { name: 'Delete run' })
    const active = deletes.find((b) => (b as HTMLButtonElement).disabled)
    await expect(active).toBeTruthy()
    window.confirm = () => true
    const other = deletes.find((b) => !(b as HTMLButtonElement).disabled)!
    await userEvent.click(other)
    await expect(args.onDeleteRun).toHaveBeenCalledOnce()
    await expect(args.onSelectRun).not.toHaveBeenCalled()
  },
}
