import { useState } from 'react'
import { Spinner } from './Spinner'

export const inputClass = 'w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-xs text-zinc-700 placeholder-zinc-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200 dark:placeholder-zinc-500 dark:focus:border-blue-500'

/** Save/Cancel buttons for inline edit forms; Save shows a spinner while `saving`. */
export function EditActions({ saving, onSave, onCancel }: { saving: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-600"
        onClick={onCancel}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="button"
        data-annotation-save="true"
        className="flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
        onClick={onSave}
        disabled={saving}
      >
        {saving ? <Spinner /> : null}
        Save
      </button>
    </div>
  )
}

/** Edits an annotation; an empty annotation saves as null. Escape cancels. */
export function AnnotationEditor({ initial, onSave, onCancel, rows = 4 }: {
  initial: string
  onSave: (annotation: string | null) => Promise<void>
  onCancel: () => void
  rows?: number
}) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim() || null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save annotation')
      setSaving(false)
    }
  }
  return (
    <div className="space-y-2">
      <textarea
        data-annotation-editor="true"
        className={inputClass}
        rows={rows}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="Add annotation..."
        autoFocus
        disabled={saving}
      />
      {error ? <div className="text-[11px] text-rose-500">{error}</div> : null}
      <EditActions saving={saving} onSave={save} onCancel={onCancel} />
    </div>
  )
}
