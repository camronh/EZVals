import { withThemeByClassName } from '@storybook/addon-themes'
import type { Preview } from '@storybook/react-vite'
import { mswLoader } from 'msw-storybook-addon/csf3'
import { IconSprite } from '../src/components/Icon'
import '../src/index.css'
import '../src/styles/dashboard.css'
import '../src/styles/detail.css'

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
    layout: 'padded',
    backgrounds: { disable: true },
    controls: { matchers: { color: /(background|color)$/i } },
  },
  tags: ['autodocs'],
}

export default preview
