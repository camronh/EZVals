import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview } from '@storybook/react-vite'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { IconSprite } from '../src/components/Icon'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '../src/styles/app.css'

const preview: Preview = {
  decorators: [
    withThemeByClassName({ themes: { light: '', dark: 'dark' }, defaultTheme: 'dark' }),
    (Story) => {
      // Each story starts from the app's defaults: no filters, column choices or sidebar choice from an earlier story.
      sessionStorage.clear()
      Object.keys(localStorage).filter((key) => key.startsWith('ezvals:')).forEach((key) => localStorage.removeItem(key))
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
