import { useState } from 'react'
import type { Config } from '../../types'
import { Dialog } from '../../components/Dialog'
import { Segmented } from '../../components/Dropdown'

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
const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <label htmlFor={htmlFor} className="text-sm text-fg">
        {label}
        {hint ? <span className="block text-xs text-fg-muted">{hint}</span> : null}
      </label>
      {children}
    </div>
  )
}

export function SettingsModal({ config, configNames, activeConfig, onConfigSelect, onSave, onClose }: Props) {
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
    <input id={`settings-${name}`} name={name} type="number" min="0" className="input w-24" value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} {...extra} />
  )
  return (
    <Dialog id="settings-modal" title="Settings" onClose={onClose}>
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
        <div className="px-5 py-2">
          <Row label="Theme">
            <Segmented id="settings-theme" label="Theme" value={theme} onChange={changeTheme} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </Row>
          <div className="my-1 border-t border-line-subtle" />
          <Row label="Concurrency" htmlFor="settings-concurrency" hint="Evals running at once">{number('concurrency', { min: '1' })}</Row>
          <Row label="Timeout" htmlFor="settings-timeout" hint="Seconds per eval">{number('timeout', { step: '0.1', placeholder: 'None' })}</Row>
          <Row label="Trials" htmlFor="settings-trials" hint="Runs of every eval">{number('trials', { min: '1', placeholder: '1' })}</Row>
          <Row label="Results folder" htmlFor="settings-results-dir">
            <input id="settings-results-dir" name="results_dir" type="text" className="input w-44" value={form.results_dir} onChange={(e) => setForm({ ...form, results_dir: e.target.value })} />
          </Row>
          {configNames.length > 0 ? (
            <Row label="Run config" htmlFor="settings-config">
              <select id="settings-config" className="input w-44" value={activeConfig ?? ''} onChange={(e) => onConfigSelect(e.target.value || null)}>
                <option value="">None</option>
                {configNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </Row>
          ) : null}
          <Row label="Notify when a run finishes" htmlFor="settings-completion-notifications" hint="Desktop notification and sound">
            <input id="settings-completion-notifications" type="checkbox" checked={form.completion_notifications} onChange={(e) => setForm({ ...form, completion_notifications: e.target.checked })} />
          </Row>
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <button type="button" id="settings-cancel" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </Dialog>
  )
}
