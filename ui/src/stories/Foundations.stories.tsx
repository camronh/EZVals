import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useState } from 'react'
import { StatusIcon } from '../dashboard/components/ResultsTable'
import type { Outcome } from '../lib/stats'

const meta: Meta = { title: 'Design System/Foundations', parameters: { layout: 'padded' } }
export default meta

/** Every colour token, the grounds it is used on and what it means. Values are read live from the theme. */
const COLORS: [group: string, tokens: [name: string, usage: string][]][] = [
  ['Surfaces', [
    ['canvas', 'The app background: the runs sidebar sits on it, and panels are inset on it.'],
    ['surface', 'Panels: the main panel, the detail page, tables and the review panel.'],
    ['surface-subtle', 'Quiet regions: the detail sidebar, code wells, hovered table rows.'],
    ['surface-muted', 'Fills inside controls: segmented tracks, chips, hovered menu items and buttons.'],
    ['surface-raised', 'Floating layers: menus, popovers, dialogs, the messages drawer.'],
  ]],
  ['Text', [
    ['fg', 'Primary text: eval names, values, headings.'],
    ['fg-secondary', 'Body copy and secondary values.'],
    ['fg-muted', 'Labels, hints, timestamps, placeholders. Still 4.5:1 on every surface.'],
    ['on-emphasis', 'Text on accent-emphasis fills (the Run button).'],
  ]],
  ['Lines', [
    ['line', 'Dividers and container borders.'],
    ['line-subtle', 'Row separators inside tables.'],
    ['line-strong', 'Edges of fields and checkboxes: 3:1 so a control reads as a control.'],
  ]],
  ['Accent', [
    ['accent', 'Links, selection, the current row and the focus ring: text-safe blue.'],
    ['accent-emphasis', 'The one primary action per view (Run, Rerun, Save): navy in light, blue in dark.'],
    ['accent-emphasis-hover', 'Hover state of accent-emphasis.'],
    ['accent-subtle', 'Selected rows, pressed toggles, active-filter chips.'],
    ['focus', 'The 2px focus ring on every control.'],
  ]],
  ['Status', [
    ['success', 'Passed: text, icons and bars. Always with a check or the word.'],
    ['success-subtle', 'Background of passed chips and the passed verdict.'],
    ['danger', 'Failed and errored: text, icons and bars. Always with a cross, a warning sign or the word.'],
    ['danger-subtle', 'Background of failed chips, error callouts and the failed verdict.'],
    ['warning', 'In progress: queued and running spinners, the running verdict.'],
    ['warning-subtle', 'Background of the running verdict.'],
  ]],
  ['Compared runs', [
    ['run-1', 'First compared run (the baseline).'],
    ['run-2', 'Second compared run.'],
    ['run-3', 'Third compared run.'],
    ['run-4', 'Fourth compared run.'],
  ]],
  ['Code', [
    ['syntax-key', 'JSON keys.'],
    ['syntax-string', 'JSON strings.'],
    ['syntax-number', 'JSON numbers, booleans and null.'],
  ]],
]

function useTokenValues(names: string[]) {
  const [values, setValues] = useState<Record<string, string>>({})
  useEffect(() => {
    const read = () => setValues(Object.fromEntries(names.map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(`--${n}`).trim()])))
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [names])
  return values
}

const ALL = COLORS.flatMap(([, tokens]) => tokens.map(([name]) => name))

export const Colors: StoryObj = {
  render: function Render() {
    const values = useTokenValues(ALL)
    return (
      <div className="max-w-4xl space-y-8 bg-surface text-fg">
        {COLORS.map(([group, tokens]) => (
          <section key={group}>
            <h2 className="mb-3 text-base font-semibold">{group}</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tokens.map(([name, usage]) => (
                <div key={name} className="flex items-start gap-3 rounded-lg border border-line p-2.5">
                  <span className="h-10 w-10 shrink-0 rounded-md border border-line" style={{ background: `var(--${name})` }} />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <code className="font-mono text-sm font-medium text-fg">{name}</code>
                      <span className="font-mono text-2xs text-fg-muted">{values[name]}</span>
                    </div>
                    <p className="text-xs text-fg-secondary">{usage}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    )
  },
}

const TYPE: [cls: string, px: string, usage: string, sample: string][] = [
  ['font-mono text-4xl font-semibold tracking-tight', '40/40 mono semibold', 'The pass-rate headline.', '67%'],
  ['text-xl font-semibold', '20/28 semibold', 'Per-metric values in the summary.', '0.73'],
  ['text-base', '14/22', 'Run and dialog titles, prose outputs and markdown.', 'Your refund of $42.50 was issued on Sept 20.'],
  ['text-sm', '13/20', 'The UI default: table cells, buttons, menus.', 'Compare with this run'],
  ['font-mono text-sm font-medium', '13 mono medium', 'Eval names: they are code identifiers.', 'refund_request[direct]'],
  ['text-xs', '12/16', 'Labels, hints, meta lines, table headers.', 'support · production'],
  ['text-2xs', '11/16', 'Chips and keyboard keys.', '✓ pass'],
  ['font-mono text-xs', '12 mono', 'Structured data, errors, commands, ids.', '{"status": "shipped"}'],
]

export const Typography: StoryObj = {
  render: () => (
    <div className="max-w-4xl divide-y divide-line-subtle bg-surface text-fg">
      {TYPE.map(([cls, px, usage, sample]) => (
        <div key={cls} className="grid grid-cols-[180px_1fr] items-baseline gap-6 py-3">
          <div>
            <code className="font-mono text-xs text-fg">{cls}</code>
            <div className="text-2xs text-fg-muted">{px} · {usage}</div>
          </div>
          <div className={cls}>{sample}</div>
        </div>
      ))}
    </div>
  ),
}

export const RadiiAndShadows: StoryObj = {
  render: () => (
    <div className="flex max-w-4xl flex-wrap gap-6 bg-surface p-2 text-fg">
      {[['rounded-sm', '4px · chips, checkboxes, keys'], ['rounded-md', '6px · buttons, fields, menu items'], ['rounded-lg', '8px · cards, popovers, sidebar runs'], ['rounded-xl', '12px · the main panel, dialogs']].map(([cls, usage]) => (
        <div key={cls} className="w-40">
          <div className={`h-16 border border-line-strong bg-surface-muted ${cls}`} />
          <code className="mt-2 block font-mono text-xs">{cls}</code>
          <div className="text-2xs text-fg-muted">{usage}</div>
        </div>
      ))}
      {[['shadow-sm', 'the raised segment'], ['shadow-panel', 'the main panel, the open run'], ['shadow-popover', 'menus, popovers, toasts'], ['shadow-dialog', 'dialogs, the drawer']].map(([cls, usage]) => (
        <div key={cls} className="w-40">
          <div className={`h-16 rounded-lg border border-line bg-surface-raised ${cls}`} />
          <code className="mt-2 block font-mono text-xs">{cls}</code>
          <div className="text-2xs text-fg-muted">{usage}</div>
        </div>
      ))}
    </div>
  ),
}

/** Every outcome has an icon, so status never rests on colour alone. */
export const StatusLanguage: StoryObj = {
  render: () => (
    <div className="grid max-w-md grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 bg-surface text-sm text-fg">
      {(['passed', 'failed', 'error', 'scored', 'queued', 'running', 'not_run', 'cancelled'] as Outcome[]).map((o) => (
        <div key={o} className="contents">
          <StatusIcon outcome={o} />
          <span className="text-fg-secondary">{o.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  ),
}
