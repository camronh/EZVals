import { useRef, useState } from 'react'
import type { SessionRun } from '../../types'
import { CopyableText } from '../../components/CopyableText'
import { Dropdown, button, iconButton, primaryButton } from '../../components/Dropdown'
import { FloatingMenu } from '../../components/FloatingMenu'
import { Icon } from '../../components/Icon'
import { formatRunTimestamp } from '../../lib/format'
import { RunPicker } from './RunPicker'

export type RunState = 'idle' | 'running' | 'paused' | 'compare'

type Props = {
  sessionName?: string | null
  runName?: string | null
  runId: string
  sessionRuns: SessionRun[]
  onRename: (name: string) => void
  onRenameRun: (runId: string, name: string) => void
  onDeleteRun: (runId: string) => void
  onSelectRun: (runId: string) => void
  onNewRun: () => void
  onCompare: (runId: string) => void
  /** Runs being compared; the header then offers only "Exit". */
  comparingCount?: number
  onExitCompare: () => void
  onOpenSettings: () => void
  onRegrade: () => void
  onReloadServer: () => void
  reloading: boolean
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
  return (
    <FloatingMenu anchorRef={anchor} open={open} onClose={onClose}>
      {runs.map((run) => (
        <button key={run.run_id} className="compare-option menu-item" onClick={() => { onPick(run); onClose() }}>
          <span className="truncate">{run.run_name || run.run_id}</span>
          <span className="ml-auto shrink-0 pl-4 text-[11px] text-theme-text-muted">{formatRunTimestamp(run.timestamp)}</span>
        </button>
      ))}
    </FloatingMenu>
  )
}

function RunName({ runName, runId, sessionRuns, onRename, onRenameRun, onDeleteRun, onSelectRun }: Pick<Props, 'runName' | 'runId' | 'sessionRuns' | 'onRename' | 'onRenameRun' | 'onDeleteRun' | 'onSelectRun'>) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [picking, setPicking] = useState(false)
  const anchor = useRef<HTMLButtonElement | null>(null)
  const name = runName ?? runId
  const save = () => {
    if (draft.trim() && draft.trim() !== runName) onRename(draft.trim())
    setEditing(false)
  }
  if (editing) {
    return (
      <span className="flex items-center gap-1">
        <input
          id="run-name-input"
          className="h-7 w-48 rounded-md border border-accent-link bg-theme-bg px-2 text-sm font-medium text-theme-text outline-none"
          value={draft}
          aria-label="Run name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
          onBlur={() => setEditing(false)}
          autoFocus
          onFocus={(e) => e.currentTarget.select()}
        />
        <button className="save-run-name-btn flex h-7 w-7 items-center justify-center rounded-md text-accent-success hover:bg-theme-bg-elevated" title="Save name" aria-label="Save name" onMouseDown={(e) => e.preventDefault()} onClick={save}>
          <Icon name="check" className="h-3.5 w-3.5" />
        </button>
      </span>
    )
  }
  return (
    <span className="group flex min-w-0 items-center gap-0.5">
      {sessionRuns.some((r) => r.run_id !== runId) ? (
        <button
          ref={anchor}
          id="run-dropdown-expanded"
          className="run-dropdown-btn flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-sm font-semibold text-theme-text hover:bg-theme-bg-elevated"
          data-run-id={runId}
          onClick={() => setPicking(!picking)}
        >
          <span className="truncate">{name}</span>
          <Icon name="chevron-down" className="h-3.5 w-3.5 shrink-0 text-theme-text-muted" />
        </button>
      ) : (
        <CopyableText text={name} className="stats-run cursor-pointer truncate px-1.5 text-sm font-semibold text-theme-text" />
      )}
      <button className="edit-run-btn-expanded flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-theme-text-muted hover:bg-theme-bg-elevated hover:text-theme-text" title="Rename run" aria-label="Rename run" onClick={() => { setDraft(name); setEditing(true) }}>
        <Icon name="pencil" className="h-3 w-3" />
      </button>
      {picking ? <RunPicker anchorRef={anchor} onClose={() => setPicking(false)} sessionRuns={sessionRuns} activeRunId={runId} onSelectRun={onSelectRun} onRenameRun={onRenameRun} onDeleteRun={onDeleteRun} /> : null}
    </span>
  )
}

function RunControls({ runState, selectedCount, onRun, onStop, onPauseToggle }: Pick<Props, 'runState' | 'selectedCount' | 'onRun' | 'onStop' | 'onPauseToggle'>) {
  if (runState === 'idle') {
    return (
      <button id="play-btn" className={primaryButton} onClick={onRun}>
        <Icon name="play" className="h-3 w-3" />
        <span id="play-btn-text">{selectedCount ? `Run ${selectedCount}` : 'Run'}</span>
      </button>
    )
  }
  const paused = runState === 'paused'
  return (
    <>
      <button id="pause-btn" className={button} onClick={onPauseToggle}>
        <Icon name={paused ? 'play' : 'pause'} className="h-3 w-3" />{paused ? 'Resume' : 'Pause'}
      </button>
      <button id="play-btn" className={`${button} !text-accent-error`} onClick={onStop}>
        <Icon name="stop" className="h-3 w-3" /><span id="play-btn-text">Stop</span>
      </button>
    </>
  )
}

/** The page header: which run this is, and what you can do with it. */
export function Header(props: Props) {
  const [comparing, setComparing] = useState(false)
  const compareAnchor = useRef<HTMLButtonElement | null>(null)
  const others = props.sessionRuns.filter((r) => r.run_id !== props.runId)
  const active = props.runState === 'running' || props.runState === 'paused'
  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-theme-border bg-theme-bg px-4">
      <img src="/logo.png" alt="EZVals" className="h-6 w-6 shrink-0" />
      <div className="flex min-w-0 flex-1 items-center gap-1 text-sm">
        {props.sessionName ? (
          <>
            <CopyableText text={props.sessionName} className="stats-session hidden cursor-pointer truncate px-1 text-theme-text-muted hover:text-theme-text-secondary sm:inline" />
            <span className="hidden text-theme-text-muted opacity-60 sm:inline">/</span>
          </>
        ) : null}
        {props.comparingCount ? (
          <span id="compare-mode-label" className="px-1.5 font-semibold text-theme-text">Comparing {props.comparingCount} runs</span>
        ) : (
          <RunName {...props} />
        )}
      </div>
      {props.comparingCount ? (
        <button id="exit-compare-btn" className={button} onClick={props.onExitCompare}>Exit</button>
      ) : (
        <div className="flex shrink-0 items-center gap-2">
          <button
            ref={compareAnchor}
            id="add-compare-btn"
            className={`${button} hidden md:inline-flex`}
            aria-label="Compare runs"
            title={others.length ? undefined : 'Needs another run in this session'}
            disabled={!others.length}
            onClick={() => setComparing(!comparing)}
          >
            <Icon name="compare" />Compare
          </button>
          <RunsMenu anchor={compareAnchor} open={comparing} onClose={() => setComparing(false)} runs={others} onPick={(run) => props.onCompare(run.run_id)} />
          <button id="new-run-btn-expanded" className={`${button} hidden md:inline-flex`} aria-label="Create new run" title={active ? 'A run is in progress' : undefined} disabled={active} onClick={props.onNewRun}>
            <Icon name="plus" />New run
          </button>
          <Dropdown panelClass="z-50 w-56 p-1" button={({ toggle }) => <button id="more-menu-toggle" className={iconButton} onClick={toggle} title="More actions" aria-label="More actions"><Icon name="more" /></button>}>
            {(close) => (
              <div id="more-menu">
                <button id="regrade-btn" className="menu-item" disabled={props.runState !== 'idle'} onClick={() => { close(); props.onRegrade() }}>
                  <Icon name="target" />
                  <span>{props.selectedCount ? `Regrade ${props.selectedCount} selected` : 'Regrade'}</span>
                  <span className="ml-auto text-[11px] text-theme-text-muted">no re-run</span>
                </button>
                <button id="restart-server-btn" className="menu-item" disabled={props.reloading} onClick={() => { close(); props.onReloadServer() }}>
                  <span className={props.reloading ? 'animate-spin' : ''}><Icon name="refresh" /></span>
                  <span>{props.reloading ? 'Reloading...' : 'Reload evals'}</span>
                </button>
                <div className="my-1 border-t border-theme-border" />
                <button id="settings-toggle" className="menu-item" onClick={() => { close(); props.onOpenSettings() }}>
                  <Icon name="gear" /><span>Settings</span>
                </button>
              </div>
            )}
          </Dropdown>
          <RunControls {...props} />
        </div>
      )}
    </header>
  )
}
