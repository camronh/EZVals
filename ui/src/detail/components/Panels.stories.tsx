import type { Meta, StoryObj } from '@storybook/react-vite'
import { fn } from 'storybook/test'
import { completedRows, messages } from '../../stories/fixtures'
import { DataViewer } from '../../components/DataViewer'
import { DataPanel, Drawer, ErrorBanner } from './Panels'

const meta: Meta = { title: 'Detail/Panels', parameters: { layout: 'fullscreen' } }
export default meta

const frame = (children: React.ReactNode) => <div className="flex h-64 bg-blue-50/40 dark:bg-neutral-950">{children}</div>

export const Input: StoryObj = { render: () => frame(<DataPanel tone="input" value={completedRows[0].result.input} />) }
export const Reference: StoryObj = { render: () => frame(<DataPanel tone="reference" value={completedRows[0].result.reference} />) }
export const Output: StoryObj = { render: () => frame(<DataPanel tone="output" value={completedRows[5].result.output} />) }
export const OutputLoading: StoryObj = { render: () => frame(<DataPanel tone="output" value={null} loading />) }
export const Error: StoryObj = { render: () => <ErrorBanner error={completedRows[4].result.error!} /> }
const traceback = [
  'Traceback (most recent call last):',
  ...Array.from({ length: 40 }, (_, i) => `  File "agent/step_${i}.py", line ${10 + i}, in step_${i}\n    return step_${i + 1}(state)`),
  'anthropic.RateLimitError: 429 Too Many Requests',
].join('\n')

/** A long traceback is capped in height and scrolls; "Expand" gives it more room. */
export const LongTraceback: StoryObj = {
  render: () => <div className="flex h-[600px] flex-col"><ErrorBanner error={traceback} /><div className="flex-1 p-3 text-xs text-zinc-500">Panels below stay visible</div></div>,
}
export const MessagesDrawer: StoryObj = {
  render: () => (
    <div className="h-[600px]">
      <Drawer id="messages-pane" title="Messages" count={messages.length} open onClose={fn()}>
        <div className="p-2"><DataViewer content={messages} /></div>
      </Drawer>
    </div>
  ),
}
