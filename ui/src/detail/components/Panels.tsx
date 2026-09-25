import { useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import { CopyButton } from '../../components/CopyButton'
import { DataViewer } from '../../components/DataViewer'
import { Icon } from '../../components/Icon'
import { getRawText } from '../../lib/format'

const ghostIcon = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text'

/** A titled, copyable view of one value (input, reference or output). */
export function DataPanel({ id, tone, value, loading, className = 'flex-1', style }: {
  id?: string
  tone: 'input' | 'reference' | 'output'
  value: unknown
  loading?: boolean
  className?: string
  style?: CSSProperties
}) {
  return (
    <div id={id} className={`flex min-w-0 min-h-0 flex-col ${className}`} style={style}>
      <div className="data-panel-header flex h-9 items-center justify-between px-4 pt-1">
        <span className="text-[12px] font-medium capitalize text-theme-text-muted">{tone}</span>
        <CopyButton text={() => (loading ? '' : getRawText(value))} className={ghostIcon} />
      </div>
      <div className="data-panel-body flex-1 overflow-auto px-4 pb-4 pt-1 text-[13px] text-theme-text">
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

/** A drag handle between panes; hidden on narrow screens, where panes stack instead. */
export function ResizeHandle({ direction, onMouseDown }: { direction: 'row' | 'col'; onMouseDown: (e: MouseEvent) => void }) {
  return direction === 'col'
    ? <div className="resize-handle-v -mx-1 after:bg-theme-border max-md:hidden" onMouseDown={onMouseDown} />
    : <div className="resize-handle-h -my-1 after:bg-theme-border max-md:hidden" onMouseDown={onMouseDown} />
}

const LONG_ERROR_LINES = 8

/**
 * The result's error, capped in height so a long traceback doesn't push the panels off screen; "Expand" gives it more room.
 * A Python traceback opens scrolled to its end, where the exception is.
 */
export function ErrorBanner({ error }: { error: string }) {
  const [expanded, setExpanded] = useState(false)
  const pre = useRef<HTMLPreElement>(null)
  const long = error.split('\n').length > LONG_ERROR_LINES
  useLayoutEffect(() => {
    if (pre.current && error.startsWith('Traceback')) pre.current.scrollTop = pre.current.scrollHeight
  }, [error])
  return (
    <div className="flex-shrink-0 border-b border-theme-border bg-accent-error-bg px-4 py-2.5">
      <div className="flex items-start gap-2.5 text-accent-error">
        <span className="mt-px shrink-0"><Icon name="alert" /></span>
        <div className="min-w-0 flex-1">
          <pre ref={pre} id="data-error" className={`overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-5 ${expanded ? 'max-h-[70vh]' : 'max-h-[30vh]'}`}>{error}</pre>
          {long ? (
            <button type="button" className="mt-1 text-[12px] font-medium hover:underline" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          ) : null}
        </div>
        <CopyButton text={() => error} className="-my-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md opacity-70 hover:opacity-100" />
      </div>
    </div>
  )
}

/** A panel that slides in from the right (messages, trace). */
export function Drawer({ id, title, count, open, onClose, children }: { id: string; title: string; count: number; open: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <div id={id} className={`fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-theme-border bg-theme-bg shadow-[var(--shadow)] transition-transform duration-200 ${open ? '' : 'translate-x-full'}`} style={{ width: 700, maxWidth: '100vw' }}>
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-theme-border px-4">
        <span className="text-sm font-semibold text-theme-text">{title}<span className="ml-2 font-mono text-[12px] font-normal tabular-nums text-theme-text-muted">{count}</span></span>
        <button onClick={onClose} className={`${ghostIcon} !h-8 !w-8`} title="Close"><Icon name="close" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{open ? children : null}</div>
    </div>
  )
}
