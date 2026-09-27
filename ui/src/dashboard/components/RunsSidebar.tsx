import { useRef, useState } from 'react'
import type { SessionRun } from '../../types'
import { CopyableText } from '../../components/CopyableText'
import { useMenuKeys } from '../../components/Dropdown'
import { FloatingMenu } from '../../components/FloatingMenu'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'
import { formatRunTimestamp } from '../../lib/format'
import { passRate } from '../../lib/stats'

type Props = {
  sessionName?: string | null
  /** The session's runs, newest first. */
  runs: SessionRun[]
  activeRunId: string
  /** The active run is running (its row shows a spinner). */
  running: boolean
  comparing: boolean
  reloading: boolean
  onSelectRun: (runId: string) => void
  onNewRun: () => void
  onCompare: (runId: string) => void
  onRenameRun: (runId: string, name: string) => void
  onDeleteRun: (runId: string) => void
  onReload: () => void
  onOpenSettings: () => void
}

/** Passed, failed and errored shares of a run, as a small bar with the rest left as track. */
function MiniBar({ run }: { run: SessionRun }) {
  const total = run.total_evaluations || 1
  const parts = [[run.total_passed, 'bg-success'], [run.total_failed, 'bg-danger'], [run.total_errors, 'bg-danger opacity-50']] as const
  return (
    <span className="flex h-1 w-14 shrink-0 gap-px overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
      {parts.map(([n, tone]) => (n ? <span key={tone} className={tone} style={{ width: `${(n / total) * 100}%` }} /> : null))}
    </span>
  )
}

function RunMenu({ run, active, comparing, onClose, anchor, ...props }: Pick<Props, 'onCompare' | 'onDeleteRun'> & {
  run: SessionRun
  active: boolean
  comparing: boolean
  anchor: React.RefObject<HTMLButtonElement | null>
  onClose: () => void
  onRename: () => void
}) {
  const menu = useRef<HTMLDivElement | null>(null)
  useMenuKeys(true, menu, onClose, anchor)
  const name = run.run_name || run.run_id
  const act = (action: () => void) => () => {
    onClose()
    action()
  }
  return (
    <FloatingMenu ref={menu} anchorRef={anchor} open onClose={onClose} role="menu" aria-label={`${name} actions`} className="menu-popover !min-w-[200px]">
      {active ? null : (
        <button role="menuitem" className="menu-item" disabled={comparing} onClick={act(() => props.onCompare(run.run_id))}>
          <Icon name="compare" />Compare with this run
        </button>
      )}
      <button role="menuitem" className="menu-item" onClick={act(props.onRename)}><Icon name="pencil" />Rename</button>
      <button role="menuitem" className="menu-item" onClick={act(() => navigator.clipboard.writeText(name))}><Icon name="copy" />Copy name</button>
      <div role="separator" className="my-1 border-t border-line" />
      <button
        role="menuitem"
        className="menu-item run-picker-delete-btn hover:!text-danger"
        disabled={active}
        title={active ? 'Switch to another run to delete this one' : undefined}
        onClick={act(() => window.confirm(`Delete run "${name}"? This can't be undone.`) && props.onDeleteRun(run.run_id))}
      >
        <Icon name="trash" />Delete run
      </button>
    </FloatingMenu>
  )
}

function RunItem({ run, active, running, comparing, ...props }: Pick<Props, 'onSelectRun' | 'onCompare' | 'onRenameRun' | 'onDeleteRun'> & {
  run: SessionRun
  active: boolean
  running: boolean
  comparing: boolean
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const name = run.run_name || run.run_id
  const rate = passRate(run.total_passed ?? 0, run.total_failed ?? 0, run.total_errors ?? 0)
  const save = () => {
    if (draft?.trim() && draft.trim() !== name) props.onRenameRun(run.run_id, draft.trim())
    setDraft(null)
  }
  return (
    <li data-run-id={run.run_id} className={`run-item group relative rounded-lg ${active ? 'bg-surface shadow-panel ring-1 ring-line' : 'hover:bg-surface-muted'}`}>
      {draft != null ? (
        <div className="px-1.5 py-1.5">
          <input
            className="input h-7 w-full px-2"
            aria-label="Run name"
            value={draft}
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') setDraft(null)
            }}
            onBlur={() => setDraft(null)}
          />
        </div>
      ) : (
        <button className="flex w-full flex-col gap-1.5 rounded-lg py-2 pl-2.5 pr-9 text-left" aria-current={active ? 'page' : undefined} onClick={() => props.onSelectRun(run.run_id)}>
          <span className="flex w-full items-center gap-2">
            <span className={`min-w-0 flex-1 truncate text-sm ${active ? 'font-semibold text-fg' : 'font-medium text-fg-secondary'}`}>{name}</span>
            <span className="font-mono text-xs tabular-nums text-fg-secondary">{rate != null ? `${Math.round(rate * 100)}%` : '—'}</span>
          </span>
          <span className="flex w-full items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-2xs text-fg-muted">
              {active && running ? <><Spinner className="h-2.5 w-2.5 text-accent" />Running…</> : run.timestamp ? formatRunTimestamp(run.timestamp) : 'Not run yet'}
            </span>
            <MiniBar run={run} />
          </span>
        </button>
      )}
      {draft == null ? (
        <button
          ref={anchor}
          className={`btn btn-ghost btn-xs btn-icon absolute right-1.5 top-2 ${menuOpen || active ? '' : 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100'}`}
          aria-label={`${name} actions`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Icon name="more" />
        </button>
      ) : null}
      {menuOpen ? <RunMenu run={run} active={active} comparing={comparing} anchor={anchor} onClose={() => setMenuOpen(false)} onRename={() => setDraft(name)} onCompare={props.onCompare} onDeleteRun={props.onDeleteRun} /> : null}
    </li>
  )
}

/** The app's left rail: the mark, the session, its runs (open, compare, rename, delete) and app-wide actions. */
export function RunsSidebar(props: Props) {
  return (
    <aside aria-label="Session" className="flex w-64 shrink-0 flex-col bg-canvas">
      <div className="flex h-12 items-center gap-2 px-4">
        <img src="/logo.png" alt="" className="h-6 w-6" />
        <span className="font-mono text-base font-bold tracking-tight text-fg">EZVals</span>
      </div>
      {props.sessionName ? (
        <div className="px-4 pb-1 pt-2">
          <div className="section-label">Session</div>
          <CopyableText text={props.sessionName} className="stats-session mt-0.5 block max-w-full truncate text-sm font-medium text-fg" />
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between pl-4 pr-3">
        <h2 className="section-label">Runs</h2>
        <button id="new-run-btn-expanded" className="btn btn-ghost btn-xs btn-icon" aria-label="Create new run" title={props.running ? 'A run is in progress' : 'New run'} disabled={props.running} onClick={props.onNewRun}>
          <Icon name="plus" />
        </button>
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 pt-1">
        {props.runs.map((run) => (
          <RunItem key={run.run_id} run={run} active={run.run_id === props.activeRunId} running={props.running} comparing={props.comparing} onSelectRun={props.onSelectRun} onCompare={props.onCompare} onRenameRun={props.onRenameRun} onDeleteRun={props.onDeleteRun} />
        ))}
      </ul>
      <div className="space-y-0.5 border-t border-line p-2">
        <button id="restart-server-btn" className="menu-item" disabled={props.reloading} onClick={props.onReload}>
          <span className={props.reloading ? 'animate-spin' : ''}><Icon name="refresh" /></span>{props.reloading ? 'Reloading…' : 'Reload evals'}
        </button>
        <button id="settings-toggle" className="menu-item" onClick={props.onOpenSettings}><Icon name="gear" />Settings</button>
      </div>
    </aside>
  )
}
