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
      lg: ['16px', { lineHeight: '24px' }],
      xl: ['20px', { lineHeight: '28px' }],
      '2xl': ['24px', { lineHeight: '32px' }],
      '3xl': ['32px', { lineHeight: '36px' }],
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
      popover: 'var(--shadow-popover)',
      dialog: 'var(--shadow-dialog)',
    },
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
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
