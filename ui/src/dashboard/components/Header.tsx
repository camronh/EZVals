import { useRef, useState } from 'react'
import type { SessionRun } from '../../types'
import { useMenuKeys } from '../../components/Dropdown'
import { FloatingMenu } from '../../components/FloatingMenu'
import { Icon } from '../../components/Icon'
import { formatRunTimestamp } from '../../lib/format'

export type RunState = 'idle' | 'running' | 'paused' | 'compare'

type Props = {
  runName?: string | null
  runId: string
  /** "6 evals · Sep 24, 4:00 PM" beside the title. */
  meta?: string
  sessionRuns: SessionRun[]
  sidebarOpen: boolean
  onToggleSidebar: () => void
  onRename: (name: string) => void
  onCompare: (runId: string) => void
  /** Runs being compared; the header then offers only "Exit". */
  comparingCount?: number
  onExitCompare: () => void
  onRegrade: () => void
  /** Some finished result has a target to score its output again; without one, Regrade is not offered. */
  canRegrade: boolean
  runState: RunState
  selectedCount: number
  onRun: () => void
  onStop: () => void
  onPauseToggle: () => void
}

/** Pick one of `runs`; used by Compare here and by "Add run" in the comparison summary. */
export function RunsMenu({ anchor, open, onClose, runs, onPick }: {
  anchor: React.RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  runs: SessionRun[]
  onPick: (run: SessionRun) => void
}) {
  const menu = useRef<HTMLDivElement | null>(null)
  useMenuKeys(open, menu, onClose, anchor)
  return (
    <FloatingMenu ref={menu} anchorRef={anchor} open={open} onClose={onClose} role="menu" aria-label="Runs to compare">
      {runs.map((run) => (
        <button key={run.run_id} role="menuitem" className="compare-option menu-item" onClick={() => { onPick(run); onClose() }}>
          <span className="truncate">{run.run_name || run.run_id}</span>
          <span className="ml-auto shrink-0 pl-4 text-xs text-fg-muted">{formatRunTimestamp(run.timestamp)}</span>
        </button>
      ))}
    </FloatingMenu>
  )
}

function RunTitle({ runName, runId, onRename }: Pick<Props, 'runName' | 'runId' | 'onRename'>) {
  const [draft, setDraft] = useState<string | null>(null)
  const name = runName ?? runId
  const save = () => {
    if (draft?.trim() && draft.trim() !== runName) onRename(draft.trim())
    setDraft(null)
  }
  if (draft != null) {
    return (
      <span className="flex items-center gap-1">
        <input
          id="run-name-input"
          className="input h-7 w-56 font-semibold"
          value={draft}
          aria-label="Run name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setDraft(null) }}
          onBlur={() => setDraft(null)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="save-run-name-btn btn btn-ghost btn-sm btn-icon !text-success" title="Save name" aria-label="Save name" onMouseDown={(e) => e.preventDefault()} onClick={save}>
          <Icon name="check" />
        </button>
      </span>
    )
  }
  return (
    <span className="flex min-w-0 items-center gap-0.5">
      <h1 id="run-name" className="truncate text-base font-semibold text-fg" data-run-id={runId}>{name}</h1>
      <button className="edit-run-btn-expanded btn btn-ghost btn-xs btn-icon" title="Rename run" aria-label="Rename run" onClick={() => setDraft(name)}>
        <Icon name="pencil" className="h-3 w-3" />
      </button>
    </span>
  )
}

function RunControls({ runState, selectedCount, onRun, onStop, onPauseToggle }: Pick<Props, 'runState' | 'selectedCount' | 'onRun' | 'onStop' | 'onPauseToggle'>) {
  if (runState === 'idle') {
    return (
      <button id="play-btn" className="btn btn-primary" onClick={onRun}>
        <Icon name="play" className="h-3 w-3" />
        <span id="play-btn-text">{selectedCount ? `Run ${selectedCount}` : 'Run'}</span>
      </button>
    )
  }
  const paused = runState === 'paused'
  return (
    <>
      <button id="pause-btn" className="btn" onClick={onPauseToggle}>
        <Icon name={paused ? 'play' : 'pause'} className="h-3 w-3" />{paused ? 'Resume' : 'Pause'}
      </button>
      <button id="play-btn" className="btn btn-danger" onClick={onStop}>
        <Icon name="stop" className="h-3 w-3" /><span id="play-btn-text">Stop</span>
      </button>
    </>
  )
}

/** The top of the main panel: the sidebar toggle, the run's name, and what you can do with the run. */
export function Header(props: Props) {
  const [comparing, setComparing] = useState(false)
  const compareAnchor = useRef<HTMLButtonElement | null>(null)
  const others = props.sessionRuns.filter((r) => r.run_id !== props.runId)
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-surface pl-2 pr-3">
      <button
        className="btn btn-ghost btn-sm btn-icon"
        aria-label={props.sidebarOpen ? 'Hide runs' : 'Show runs'}
        aria-expanded={props.sidebarOpen}
        title={props.sidebarOpen ? 'Hide runs' : 'Show runs'}
        onClick={props.onToggleSidebar}
      >
        <Icon name="sidebar" />
      </button>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {props.comparingCount ? (
          <h1 id="compare-mode-label" className="text-base font-semibold text-fg">Comparing {props.comparingCount} runs</h1>
        ) : (
          <RunTitle runName={props.runName} runId={props.runId} onRename={props.onRename} />
        )}
        {props.meta && !props.comparingCount ? <span className="hidden truncate text-xs text-fg-muted md:inline">{props.meta}</span> : null}
      </div>
      {props.comparingCount ? (
        <button id="exit-compare-btn" className="btn" onClick={props.onExitCompare}>Exit</button>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          {others.length ? (
            <>
              <button
                ref={compareAnchor}
                id="add-compare-btn"
                className="btn hidden md:inline-flex"
                aria-label="Compare runs"
                aria-haspopup="menu"
                aria-expanded={comparing}
                onClick={() => setComparing(!comparing)}
              >
                <Icon name="compare" />Compare
              </button>
              <RunsMenu anchor={compareAnchor} open={comparing} onClose={() => setComparing(false)} runs={others} onPick={(run) => props.onCompare(run.run_id)} />
            </>
          ) : null}
          {props.canRegrade ? (
            <button id="regrade-btn" className="btn hidden md:inline-flex" disabled={props.runState !== 'idle'} title="Score the stored outputs again, without running the evals" onClick={props.onRegrade}>
              <Icon name="target" />{props.selectedCount ? `Regrade ${props.selectedCount}` : 'Regrade'}
            </button>
          ) : null}
          <RunControls {...props} />
        </div>
      )}
    </header>
  )
}
