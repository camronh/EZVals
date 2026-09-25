import { useState } from 'react'
import type { Config } from '../../types'
import { Icon } from '../../components/Icon'

type Props = {
  config: Config
  configNames: string[]
  activeConfig: string | null
  onConfigSelect: (name: string | null) => void
  onToggleTheme: () => void
  onSave: (config: Config) => void
  onClose: () => void
}

const inputClass = 'rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none'
const optionalNumber = (value: string) => (value.trim() === '' ? undefined : Number(value))

export function SettingsModal({ config, configNames, activeConfig, onConfigSelect, onToggleTheme, onSave, onClose }: Props) {
  const [form, setForm] = useState({
    concurrency: String(config.concurrency ?? ''),
    timeout: String(config.timeout ?? ''),
    trials: String(config.trials ?? ''),
    results_dir: config.results_dir ?? '',
    completion_notifications: !!config.completion_notifications,
  })
  const field = (name: 'concurrency' | 'timeout' | 'trials', label: string, extra: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="flex items-center justify-between">
      <label className="text-theme-text-muted" htmlFor={`settings-${name}`}>{label}</label>
      <input id={`settings-${name}`} name={name} type="number" min="0" className={`w-20 ${inputClass}`} value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })} {...extra} />
    </div>
  )
  return (
    <div id="settings-modal" className="fixed inset-0 z-50">
      <div id="settings-backdrop" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme-border bg-theme-bg p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-theme-text">Settings</span>
          <button id="settings-close" className="text-theme-text-muted hover:text-theme-text-secondary" onClick={onClose}><Icon name="close" className="h-4 w-4" /></button>
        </div>
        <form
          id="settings-form"
          className="space-y-3 text-xs"
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
          {field('concurrency', 'Concurrency', { min: '1' })}
          {field('timeout', 'Timeout (s)', { step: '0.1', placeholder: 'none' })}
          {field('trials', 'Trials', { min: '1', placeholder: 'per eval', title: 'Run every eval this many times' })}
          <div className="flex items-center justify-between">
            <label className="text-theme-text-muted" htmlFor="settings-results-dir">Results dir</label>
            <input id="settings-results-dir" name="results_dir" type="text" className={`w-32 ${inputClass}`} value={form.results_dir} onChange={(e) => setForm({ ...form, results_dir: e.target.value })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-theme-text-muted">Theme</span>
            <button type="button" id="theme-toggle" className={`flex items-center gap-1.5 ${inputClass} hover:bg-theme-bg-elevated`} onClick={onToggleTheme}>
              <span className="hidden dark:inline"><Icon name="sun" className="h-3 w-3" /></span>
              <span className="dark:hidden"><Icon name="moon" className="h-3 w-3" /></span>
              <span className="dark:hidden">Dark</span><span className="hidden dark:inline">Light</span>
            </button>
          </div>
          {configNames.length > 0 ? (
            <div className="flex items-center justify-between">
              <label className="text-theme-text-muted" htmlFor="settings-config">Run Config</label>
              <select id="settings-config" className={`w-32 ${inputClass}`} value={activeConfig ?? ''} onChange={(e) => onConfigSelect(e.target.value || null)}>
                <option value="">None</option>
                {configNames.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </div>
          ) : null}
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-theme-text-muted">Notifications</span>
            <input id="settings-completion-notifications" type="checkbox" checked={form.completion_notifications} onChange={(e) => setForm({ ...form, completion_notifications: e.target.checked })} />
          </label>
          <div className="flex justify-end gap-2 border-t border-theme-border pt-3">
            <button type="button" id="settings-cancel" className="rounded border border-theme-border bg-theme-bg-secondary px-3 py-1.5 text-theme-text-muted hover:bg-theme-bg-elevated" onClick={onClose}>Cancel</button>
            <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
