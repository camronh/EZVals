import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { DataViewer } from '../../components/DataViewer'
import { Icon } from '../../components/Icon'
import { getRawText } from '../../lib/format'

const TONES = {
  input: ['border-blue-100 bg-blue-50/50 dark:border-zinc-800/60 dark:bg-zinc-900/50', 'text-blue-600 dark:text-blue-400', 'bg-white dark:bg-zinc-900/30', 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'],
  reference: ['border-amber-200/40 bg-amber-50/50 dark:border-amber-500/10 dark:bg-amber-500/5', 'text-amber-600 dark:text-amber-400', 'bg-amber-50/30 dark:bg-amber-500/5', 'text-amber-500 hover:text-amber-700 dark:hover:text-amber-300'],
  output: ['border-blue-100 bg-emerald-50/50 dark:border-zinc-800/60 dark:bg-zinc-900/50', 'text-emerald-600 dark:text-emerald-400', 'bg-white dark:bg-zinc-900/30', 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300'],
}

/** A titled, copyable view of one value (input, reference or output). */
export function DataPanel({ id, tone, value, loading, className = 'flex-1', style }: {
  id?: string
  tone: keyof typeof TONES
  value: unknown
  loading?: boolean
  className?: string
  style?: CSSProperties
}) {
  const [header, title, body, copy] = TONES[tone]
  return (
    <div id={id} className={`flex min-w-0 min-h-0 flex-col ${className}`} style={style}>
      <div className={`data-panel-header flex items-center justify-between border-b px-3 py-1.5 ${header}`}>
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${title}`}>{tone}</span>
        <CopyButton text={() => (loading ? '' : getRawText(value))} className={copy} />
      </div>
      <div className={`data-panel-body flex-1 overflow-auto p-3 ${body}`}>
        {loading ? (
          <div id="output-loading-indicator" className="output-loading-state" role="status" aria-live="polite" aria-label="Output is loading">
            <div className="output-loading-line output-loading-line-1" />
            <div className="output-loading-line output-loading-line-2" />
            <div className="output-loading-line output-loading-line-3" />
          </div>
        ) : (
          <DataViewer content={value} placeholder="—" />
        )}
      </div>
    </div>
  )
}

export function ResizeHandle({ direction, onMouseDown }: { direction: 'row' | 'col'; onMouseDown: (e: MouseEvent) => void }) {
  return direction === 'col'
    ? <div className="resize-handle-v w-1 flex-shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-blue-500/30" onMouseDown={onMouseDown} />
    : <div className="resize-handle-h h-1 flex-shrink-0 cursor-row-resize bg-transparent transition-colors hover:bg-blue-500/30" onMouseDown={onMouseDown} />
}

export function ErrorBanner({ error }: { error: string }) {
  return (
    <div className="flex-shrink-0 border-b border-rose-200 bg-rose-50 px-4 py-2 dark:border-rose-500/30 dark:bg-rose-500/10">
      <div className="flex items-start gap-2 text-sm">
        <span className="mt-0.5 shrink-0 text-rose-500"><Icon name="alert" /></span>
        <pre id="data-error" className="flex-1 whitespace-pre-wrap font-mono text-xs text-rose-600 dark:text-rose-300">{error}</pre>
        <CopyButton text={() => error} className="shrink-0 text-rose-400 hover:text-rose-600" />
      </div>
    </div>
  )
}

/** A panel that slides in from the right (messages, trace). */
export function Drawer({ id, title, count, open, onClose, children }: { id: string; title: string; count: number; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div id={id} className={`fixed bottom-0 right-0 top-0 z-50 border-l border-zinc-200 bg-white shadow-xl transition-transform duration-200 dark:border-zinc-700 dark:bg-zinc-900 ${open ? '' : 'translate-x-full'}`} style={{ width: 700, maxWidth: '100vw' }}>
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{title} <span className="text-zinc-400">({count})</span></span>
        <button onClick={onClose} className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800" title="Close"><Icon name="close" className="h-4 w-4" /></button>
      </div>
      <div className="h-[calc(100%-41px)] overflow-auto">{open ? children : null}</div>
    </div>
  )
}
