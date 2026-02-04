import type { Dispatch, FormEvent, SetStateAction } from 'react'

type SettingsFormState = {
  concurrency: string
  results_dir: string
  timeout: string
}

type SettingsModalProps = {
  open: boolean
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  settingsForm: SettingsFormState
  setSettingsForm: Dispatch<SetStateAction<SettingsFormState>>
  onToggleTheme: () => void
}

export default function SettingsModal({
  open,
  onClose,
  onSave,
  settingsForm,
  setSettingsForm,
  onToggleTheme,
}: SettingsModalProps) {
  if (!open) {
    return <div id="settings-modal" className="fixed inset-0 z-50 hidden"></div>
  }

  return (
    <div id="settings-modal" className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" id="settings-backdrop" onClick={onClose}></div>
      <div className="absolute left-1/2 top-1/2 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-theme-border bg-theme-bg p-4 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-medium text-theme-text">Settings</span>
          <button id="settings-close" className="text-theme-text-muted hover:text-theme-text-secondary" onClick={onClose}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <use href="#icon-close"></use>
            </svg>
          </button>
        </div>
        <form id="settings-form" className="space-y-3 text-xs" onSubmit={onSave}>
          <div className="flex items-center justify-between">
            <label className="text-theme-text-muted">Concurrency</label>
            <input
              type="number"
              name="concurrency"
              min="0"
              className="w-20 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none"
              value={settingsForm.concurrency}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, concurrency: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-theme-text-muted">Results dir</label>
            <input
              type="text"
              name="results_dir"
              className="w-32 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none"
              value={settingsForm.results_dir}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, results_dir: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-theme-text-muted">Timeout (s)</label>
            <input
              type="number"
              name="timeout"
              min="0"
              step="0.1"
              className="w-20 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text focus:border-blue-500 focus:outline-none"
              placeholder="none"
              value={settingsForm.timeout}
              onChange={(e) => setSettingsForm((prev) => ({ ...prev, timeout: e.target.value }))}
            />
          </div>
          <div className="flex items-center justify-between">
            <label className="text-theme-text-muted">Theme</label>
            <button type="button" id="theme-toggle" className="flex items-center gap-1.5 rounded border border-theme-border bg-theme-bg-secondary px-2 py-1 text-theme-text-secondary hover:bg-theme-bg-elevated" onClick={onToggleTheme}>
              <svg className="hidden dark:block h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-sun"></use>
              </svg>
              <svg className="block dark:hidden h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <use href="#icon-moon"></use>
              </svg>
              <span className="dark:hidden">Dark</span><span className="hidden dark:inline">Light</span>
            </button>
          </div>
          <div className="flex justify-end gap-2 border-t border-theme-border pt-3">
            <button type="button" id="settings-cancel" className="rounded border border-theme-border bg-theme-bg-secondary px-3 py-1.5 text-theme-text-muted hover:bg-theme-bg-elevated" onClick={onClose}>Cancel</button>
            <button type="submit" className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500">Save</button>
          </div>
        </form>
      </div>
    </div>
  )
}
