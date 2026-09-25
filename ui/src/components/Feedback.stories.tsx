import type { Meta, StoryObj } from '@storybook/react-vite'
import { CopyButton } from './CopyButton'
import { CopyableText } from './CopyableText'
import { Spinner } from './Spinner'
import { Toasts } from './Toasts'

const meta: Meta = { title: 'Components/Feedback' }
export default meta

export const Spinners: StoryObj = { render: () => <div className="flex gap-4 text-theme-text"><Spinner /><Spinner className="h-5 w-5" /></div> }
export const Copy: StoryObj = {
  render: () => (
    <div className="flex items-center gap-4 text-sm text-theme-text">
      <CopyButton text={() => 'ezvals run evals/support.py::refund_request'} className="text-theme-text-muted" />
      <CopyableText text="swift-falcon" className="cursor-pointer font-mono" />
    </div>
  ),
}
export const ToastMessages: StoryObj = {
  render: () => <Toasts toasts={[{ id: 1, message: 'Regrading 3 results (1 skipped: no target)', tone: 'success' }, { id: 2, message: 'Run failed: Eval path not found: evals/', tone: 'error' }]} />,
}
