import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, MouseEvent, ReactNode } from 'react'
import type { ResultData } from '../../types'
import { CopyButton } from '../../components/CopyButton'
import { DataViewer } from '../../components/DataViewer'
import { Icon, type IconName } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { errorSummary, getRawText } from '../../lib/format'
import { outcomeOf } from '../../lib/stats'

const LABELS = { input: 'Input', output: 'Output', reference: 'Reference' }

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
    <section id={id} aria-label={LABELS[tone]} className={`flex min-h-0 min-w-0 flex-col ${className}`} style={style}>
      <div className="data-panel-header flex h-10 items-center justify-between pl-5 pr-3">
        <span className="section-label">{LABELS[tone]}</span>
        <CopyButton text={() => (loading ? '' : getRawText(value))} title={`Copy ${tone}`} className="btn btn-ghost btn-xs btn-icon" />
      </div>
      <div className="data-panel-body flex-1 overflow-auto px-5 pb-5 text-fg">
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
    </section>
  )
}

/** A drag handle between panes; hidden on narrow screens, where panes stack instead. */
export function ResizeHandle({ direction, onMouseDown }: { direction: 'row' | 'col'; onMouseDown: (e: MouseEvent) => void }) {
  return direction === 'col'
    ? <div className="resize-handle-v -mx-1 max-md:hidden" onMouseDown={onMouseDown} />
    : <div className="resize-handle-h -my-1 max-md:hidden" onMouseDown={onMouseDown} />
}

const TONES = {
  danger: 'bg-danger-subtle text-danger',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  neutral: 'bg-surface-subtle text-fg-secondary',
}
const LONG_DETAIL_LINES = 8

/**
 * A full-width strip under the header: an icon and a title in the tone's colour, a line of explanation, and
 * optionally a long detail (a traceback), capped in height with "Show all" to give it more room.
 */
export function Banner({ tone, icon, title, children, detail }: {
  tone: keyof typeof TONES
  icon: IconName | 'spinner'
  title: ReactNode
  children?: ReactNode
  detail?: string
}) {
  const [expanded, setExpanded] = useState(false)
  const long = !!detail && detail.split('\n').length > LONG_DETAIL_LINES
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`verdict flex-shrink-0 border-b border-line px-5 py-2.5 ${TONES[tone]}`}>
      <div className="flex items-start gap-2.5">
        <span className="mt-[3px] shrink-0">{icon === 'spinner' ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={icon} />}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold [overflow-wrap:anywhere]">{title}</div>
          {children ? <div className="mt-0.5 text-sm text-fg-secondary [overflow-wrap:anywhere]">{children}</div> : null}
          {detail ? (
            <pre id="data-error" className={`mt-2 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-fg-secondary ${expanded ? 'max-h-[70vh]' : 'max-h-[30vh]'}`} tabIndex={0}>{detail}</pre>
          ) : null}
          {long ? (
            <button type="button" className="btn btn-ghost btn-xs mt-1 -ml-1.5 !text-current" onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
              {expanded ? 'Show less' : 'Show all'}
            </button>
          ) : null}
        </div>
        {detail ? <CopyButton text={() => detail} title="Copy error" className="btn btn-ghost btn-xs btn-icon -my-0.5 !text-current" /> : null}
      </div>
    </div>
  )
}

/** How the result came out and why, from its error, its scores' notes or its status. Numeric-only results have none. */
export function Verdict({ result }: { result: ResultData }) {
  const outcome = outcomeOf(result)
  const scores = result.scores ?? []
  const noted = (keep: (passed: boolean | null | undefined) => boolean) => scores.filter((s) => s.notes && keep(s.passed)).map((s, i) => (
    <p key={i}>{scores.length > 1 ? <span className="font-medium text-fg">{s.key}: </span> : null}{s.notes}</p>
  ))
  switch (outcome) {
    case 'error': {
      const summary = errorSummary(result.error!)
      const lines = result.error!.trim().split('\n')
      const rest = lines.filter((_, i) => i !== lines.findIndex((l) => l.trim() === summary)).join('\n')
      return <Banner tone="danger" icon="alert" title={summary} detail={rest || undefined} />
    }
    case 'failed': {
      const failed = scores.filter((s) => s.passed === false)
      return <Banner tone="danger" icon="close" title={scores.length > 1 ? `Failed ${failed.map((s) => s.key).join(', ')}` : 'Failed'}>{noted((p) => p === false)}</Banner>
    }
    case 'passed':
      return <Banner tone="success" icon="check" title="Passed">{noted((p) => p !== false)}</Banner>
    case 'running':
    case 'queued':
      return <Banner tone="warning" icon="spinner" title={outcome === 'running' ? 'Running…' : 'Queued'} />
    case 'cancelled':
      return <Banner tone="neutral" icon="stop" title="Cancelled" />
    case 'not_run':
      return <Banner tone="neutral" icon="play" title="Not run yet" />
    default:
      return null
  }
}

/** A panel that slides in from the right over the page (messages). */
export function Drawer({ id, title, count, open, onClose, children }: { id: string; title: string; count: number; open: boolean; onClose: () => void; children: ReactNode }) {
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (open) close.current?.focus()
  }, [open])
  return (
    <div id={id} role="dialog" aria-label={title} aria-hidden={!open} inert={!open} className={`fixed bottom-0 right-0 top-0 z-50 flex flex-col border-l border-line bg-surface-raised shadow-dialog transition-[transform,visibility] duration-200 ${open ? '' : 'invisible translate-x-full'}`} style={{ width: 700, maxWidth: '100vw' }}>
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-line pl-5 pr-3">
        <span className="text-base font-semibold text-fg">{title}<span className="ml-2 text-xs font-normal tabular-nums text-fg-muted">{count}</span></span>
        <button ref={close} onClick={onClose} className="btn btn-ghost btn-sm btn-icon" title="Close" aria-label={`Close ${title.toLowerCase()}`}><Icon name="close" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{open ? children : null}</div>
    </div>
  )
}
