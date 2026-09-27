/** @type {import('tailwindcss').Config} */
// The design system's scales. Colors are CSS variables (src/styles/app.css) so light and dark share class names;
// the type, radius and shadow scales replace Tailwind's defaults so only system values exist.
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    fontSize: {
      '2xs': ['11px', { lineHeight: '16px' }],
      xs: ['12px', { lineHeight: '16px' }],
      sm: ['13px', { lineHeight: '20px' }],
      base: ['14px', { lineHeight: '22px' }],
      xl: ['20px', { lineHeight: '28px' }],
      '4xl': ['40px', { lineHeight: '40px' }],
    },
    borderRadius: {
      none: '0',
      sm: '4px',
      DEFAULT: '6px',
      md: '6px',
      lg: '8px',
      xl: '12px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      sm: 'var(--shadow-sm)',
      panel: 'var(--shadow-panel)',
      popover: 'var(--shadow-popover)',
      dialog: 'var(--shadow-dialog)',
    },
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', 'ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['"Geist Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        canvas: 'var(--canvas)',
        surface: {
          DEFAULT: 'var(--surface)',
          subtle: 'var(--surface-subtle)',
          muted: 'var(--surface-muted)',
          raised: 'var(--surface-raised)',
        },
        fg: {
          DEFAULT: 'var(--fg)',
          secondary: 'var(--fg-secondary)',
          muted: 'var(--fg-muted)',
          'on-emphasis': 'var(--on-emphasis)',
        },
        line: {
          DEFAULT: 'var(--line)',
          subtle: 'var(--line-subtle)',
          strong: 'var(--line-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          emphasis: 'var(--accent-emphasis)',
          'emphasis-hover': 'var(--accent-emphasis-hover)',
          subtle: 'var(--accent-subtle)',
        },
        success: { DEFAULT: 'var(--success)', subtle: 'var(--success-subtle)' },
        danger: { DEFAULT: 'var(--danger)', subtle: 'var(--danger-subtle)' },
        warning: { DEFAULT: 'var(--warning)', subtle: 'var(--warning-subtle)' },
      },
    },
  },
}
