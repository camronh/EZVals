import type { Meta, StoryObj } from '@storybook/react-vite'
import { useRef } from 'react'
import { fn } from 'storybook/test'
import { sessionRuns } from '../../stories/fixtures'
import { RunPicker } from './RunPicker'

const meta: Meta<typeof RunPicker> = {
  title: 'Dashboard/RunPicker',
  component: RunPicker,
  args: { sessionRuns, activeRunId: 'a1b2c3d4', onClose: fn(), onSelectRun: fn(), onRenameRun: fn() },
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
