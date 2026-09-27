import type { Meta, StoryObj } from '@storybook/react-vite'
import { Icon, type IconName } from './Icon'

const names: IconName[] = ['search', 'filter', 'grid', 'gear', 'refresh', 'play', 'pause', 'stop', 'download', 'close', 'sun', 'moon', 'chevron-up',
  'chevron-down', 'chevron-right', 'copy', 'check', 'pencil', 'plus', 'compare', 'message', 'target', 'rerun', 'arrow-left', 'external', 'alert', 'more', 'doc', 'github']

const meta: Meta<typeof Icon> = { title: 'Components/Icon', component: Icon }
export default meta

export const Gallery: StoryObj = {
  render: () => (
    <div className="grid grid-cols-6 gap-4 text-fg">
      {names.map((name) => (
        <div key={name} className="flex flex-col items-center gap-1 text-2xs text-fg-muted">
          <span className="text-fg"><Icon name={name} className="h-5 w-5" /></span>
          {name}
        </div>
      ))}
    </div>
  ),
}
