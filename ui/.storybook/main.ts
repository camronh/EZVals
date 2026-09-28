import type { StorybookConfig } from '@storybook/react-vite'

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],
  addons: ['@storybook/addon-themes', '@storybook/addon-docs', '@storybook/addon-a11y', 'msw-storybook-addon'],
  framework: '@storybook/react-vite',
  // The app's logo, plus MSW's service worker for stories that mock the API.
  staticDirs: ['../public', './public'],
}

export default config
