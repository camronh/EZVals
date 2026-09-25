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
export const MessagesDrawer: StoryObj = {
  render: () => (
    <div className="h-[600px]">
      <Drawer id="messages-pane" title="Messages" count={messages.length} open onClose={fn()}>
        <div className="p-2"><DataViewer content={messages} /></div>
      </Drawer>
    </div>
  ),
}
