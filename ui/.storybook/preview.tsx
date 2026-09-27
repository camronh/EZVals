import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview } from '@storybook/react-vite'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { IconSprite } from '../src/components/Icon'
import '../src/styles/app.css'

const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'dark' }),
    (Story) => {
      sessionStorage.clear()
      return <><IconSprite /><Story /></>
    },
  ],
  loaders: [mswLoader()],
  parameters: {
    // Every story is checked against WCAG 2.1 AA by axe when the stories run as tests (npm test).
    a11y: { test: 'error', options: { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } } },
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  tags: ['autodocs'],
}

export default preview
