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
        <button ref={anchor} className="font-mono text-sm text-theme-text">baseline v</button>
        <RunPicker {...args} anchorRef={anchor} />
      </div>
    )
  },
}
export default meta

export const Default: StoryObj<typeof RunPicker> = {}

/** Moving through runs (hover and arrow keys) must not break the page — a scrollIntoView effect once did. */
export const KeyboardAndHover: StoryObj<typeof RunPicker> = {
  play: async ({ canvasElement, args }) => {
    const page = within(canvasElement.ownerDocument.body)
    const options = await page.findAllByRole('option')
    await userEvent.hover(options[1])
    await userEvent.keyboard('{ArrowDown}{ArrowUp}')
    await userEvent.click(options[1])
    await expect(args.onSelectRun).toHaveBeenCalledWith(options[1].dataset.runId)
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
