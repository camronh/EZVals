import type { Meta, StoryObj } from '@storybook/react-vite'
import { apiHandlers, completedRun, improvedRun, runningRun, trialsRun } from '../stories/fixtures'
import { DetailPage } from './DetailPage'

const meta: Meta<typeof DetailPage> = {
  title: 'Pages/Detail',
  component: DetailPage,
  parameters: { layout: 'fullscreen', msw: { handlers: apiHandlers(completedRun) } },
  args: { runId: completedRun.run_id, index: 0, compareRunIds: [] },
}
export default meta
type Story = StoryObj<typeof DetailPage>

export const WithMessagesAndSpans: Story = {}
export const FailedScore: Story = { args: { index: 1 } }
export const StructuredData: Story = { args: { index: 3 } }
export const Errored: Story = { args: { index: 4 } }
export const Markdown: Story = { args: { index: 5 } }
export const Running: Story = { args: { index: 2 }, parameters: { msw: { handlers: apiHandlers(runningRun) } } }
export const Trial: Story = { args: { runId: trialsRun.run_id, index: 1 }, parameters: { msw: { handlers: apiHandlers(trialsRun) } } }
export const Comparison: Story = { args: { index: 1, compareRunIds: [completedRun.run_id, improvedRun.run_id] } }
