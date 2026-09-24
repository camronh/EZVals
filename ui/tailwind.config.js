/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Theme colors are CSS variables (src/styles/dashboard.css) so light and dark share class names.
      colors: {
        theme: {
          bg: 'var(--bg)',
          'bg-secondary': 'var(--bg-secondary)',
          'bg-elevated': 'var(--bg-elevated)',
          text: 'var(--text)',
          'text-secondary': 'var(--text-secondary)',
          'text-muted': 'var(--text-muted)',
          border: 'var(--border)',
          'border-subtle': 'var(--border-subtle)',
          'btn-bg': 'var(--btn-bg)',
          'btn-bg-hover': 'var(--btn-bg-hover)',
          'btn-border': 'var(--btn-border)',
        },
        accent: {
          link: 'var(--accent-link)',
          'link-hover': 'var(--accent-link-hover)',
          success: 'var(--accent-success)',
          'success-bg': 'var(--accent-success-bg)',
          error: 'var(--accent-error)',
          'error-bg': 'var(--accent-error-bg)',
        },
      },
    },
  },
}
