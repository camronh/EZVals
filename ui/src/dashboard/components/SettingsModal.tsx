import { useRef, useState } from 'react'
import type { Config } from '../../types'
import { Segmented, button, primaryButton } from '../../components/Dropdown'
import { Icon } from '../../components/Icon'
import { useDismiss } from '../../hooks/useDismiss'

type Props = {
  config: Config
  configNames: string[]
  activeConfig: string | null
  onConfigSelect: (name: string | null) => void
  onSave: (config: Config) => void
  onClose: () => void
}

type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'ezvals:theme'
const inputClass = 'h-8 rounded-md border border-theme-border bg-theme-bg px-2 text-[13px] text-theme-text focus:border-accent-link focus:outline-none'
const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <label htmlFor={htmlFor} className="text-theme-text-secondary">
        {label}
        {hint ? <span className="block text-[12px] text-theme-text-muted">{hint}</span> : null}
      </label>
      {children}
    </div>
  )
}

export function SettingsModal({ config, configNames, activeConfig, onConfigSelect, onSave, onClose }: Props) {
  const panel = useRef<HTMLDivElement | null>(null)
  useDismiss(true, [panel], onClose)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem(THEME_KEY) as Theme | null) ?? 'system')
  const [form, setForm] = useState({
    concurrency: String(config.concurrency ?? ''),
    timeout: String(config.timeout ?? ''),
    trials: String(config.trials ?? ''),
    results_dir: config.results_dir ?? '',
    completion_notifications: !!config.completion_notifications,
  })
  const changeTheme = (next: Theme) => {
    setTheme(next)
    if (next === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, next)
    document.documentElement.classList.toggle('dark', next === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : next === 'dark')
  }
  const number = (name: 'concurrency' | 'timeout' | 'trials', extra: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input id={`settings-${name}`} name={name} type="number" min="0" className={`w-24 ${inputClass}`} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} {...extra} />
  )
  return (
    <div id="settings-modal" className="fixed inset-0 z-50">
      <div id="settings-backdrop" className="absolute inset-0 bg-black/40" />
      <div ref={panel} className="absolute left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-theme-border bg-theme-bg text-[13px] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between border-b border-theme-border px-5 py-3">
          <span className="text-[15px] font-semibold text-theme-text">Settings</span>
          <button id="settings-close" className="flex h-7 w-7 items-center justify-center rounded-md text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text" aria-label="Close" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </div>
        <form
          id="settings-form"
          onSubmit={(e) => {
            e.preventDefault()
            onSave({
              concurrency: optionalNumber(form.concurrency),
              timeout: optionalNumber(form.timeout),
              trials: optionalNumber(form.trials),
              results_dir: form.results_dir.trim() || undefined,
              completion_notifications: form.completion_notifications,
            })
          }}
        >
          <div className="px-5 py-3">
            <Row label="Theme">
              <Segmented id="settings-theme" value={theme} onChange={changeTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
            </Row>
            <div className="my-2 border-t border-theme-border-subtle" />
            <Row label="Concurrency" htmlFor="settings-concurrency" hint="Evals running at once">{number('concurrency', { min: '1' })}</Row>
            <Row label="Timeout" htmlFor="settings-timeout" hint="Seconds per eval">{number('timeout', { step: '0.1', placeholder: 'none' })}</Row>
            <Row label="Trials" htmlFor="settings-trials" hint="Runs of every eval">{number('trials', { min: '1', placeholder: '1' })}</Row>
            <Row label="Results folder" htmlFor="settings-results-dir">
              <input id="settings-results-dir" name="results_dir" type="text" className={`w-40 ${inputClass}`} value={form.results_dir} onChange={(e) => setForm({ ...form, results_dir: e.target.value })} />
            </Row>
            {configNames.length > 0 ? (
              <Row label="Run config" htmlFor="settings-config">
                <select id="settings-config" className={`w-40 ${inputClass}`} value={activeConfig ?? ''} onChange={(e) => onConfigSelect(e.target.value || null)}>
                  <option value="">None</option>
                  {configNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
              </Row>
            ) : null}
            <Row label="Notify when a run finishes" htmlFor="settings-completion-notifications" hint="Desktop notification and sound">
              <input id="settings-completion-notifications" type="checkbox" className="h-4 w-4" checked={form.completion_notifications} onChange={(e) => setForm({ ...form, completion_notifications: e.target.checked })} />
            </Row>
          </div>
          <div className="flex justify-end gap-2 border-t border-theme-border px-5 py-3">
            <button type="button" id="settings-cancel" className={button} onClick={onClose}>Cancel</button>
            <button type="submit" className={primaryButton}>Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
