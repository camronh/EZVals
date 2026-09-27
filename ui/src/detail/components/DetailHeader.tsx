import { CopyButton } from '../../components/CopyButton'
import { Icon } from '../../components/Icon'
import { Spinner } from '../../components/Spinner'

type Props = {
  name: string
  trial?: number
  sessionName?: string | null
  run?: { id: string; name?: string | null }
  runCommand: string
  position: { index: number; total: number }
  onNavigate: (index: number) => void
  busy: 'rerun' | 'regrade' | null
  onRerun?: () => void
  onRegrade?: () => void
}

/** Where this result sits (session / run / eval, and its position in the run) and what can be done with it. */
export function DetailHeader({ name, trial, sessionName, run, runCommand, position, onNavigate, busy, onRerun, onRegrade }: Props) {
  return (
    <header className="flex h-12 flex-shrink-0 items-center justify-between gap-3 border-b border-line bg-surface px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <a href="/" className="btn btn-ghost btn-sm btn-icon" title="Back to results (Esc)" aria-label="Back to results"><Icon name="arrow-left" /></a>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-base">
          {sessionName ? <span className="hidden truncate text-fg-muted lg:inline">{sessionName}</span> : null}
          {sessionName ? <span aria-hidden="true" className="hidden text-line-strong lg:inline">/</span> : null}
          {run ? <a href={`/?run_id=${encodeURIComponent(run.id)}`} className="hidden max-w-[200px] truncate text-fg-muted hover:text-fg hover:underline md:inline">{run.name ?? run.id}</a> : null}
          {run ? <span aria-hidden="true" className="hidden text-line-strong md:inline">/</span> : null}
          <span aria-current="page" className="truncate font-semibold text-fg">{name}</span>
          {trial ? <span className="chip flex-shrink-0">trial {trial}</span> : null}
        </nav>
        <CopyButton text={() => runCommand} title="Copy run command" className="btn btn-ghost btn-xs btn-icon flex-shrink-0" />
      </div>
      <div className="flex flex-shrink-0 items-center gap-1.5">
        <span className="whitespace-nowrap pr-1.5 text-xs tabular-nums text-fg-muted max-sm:hidden">{position.index + 1} of {position.total}</span>
        <button id="prev-btn" className="btn btn-sm btn-icon" title="Previous result (↑)" aria-label="Previous result" disabled={position.index <= 0} onClick={() => onNavigate(position.index - 1)}><Icon name="chevron-up" /></button>
        <button id="next-btn" className="btn btn-sm btn-icon" title="Next result (↓)" aria-label="Next result" disabled={position.index >= position.total - 1} onClick={() => onNavigate(position.index + 1)}><Icon name="chevron-down" /></button>
        {onRegrade || onRerun ? <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-line" /> : null}
        {onRegrade ? (
          <button id="regrade-result-btn" className="btn" title="Score this output again without running the eval" onClick={onRegrade} disabled={!!busy}>
            {busy === 'regrade' ? <Spinner /> : <Icon name="target" className="h-3 w-3" />}
            <span className="max-sm:sr-only">{busy === 'regrade' ? 'Regrading…' : 'Regrade'}</span>
          </button>
        ) : null}
        {onRerun ? (
          <button id="rerun-btn" className="btn btn-primary" title="Run this eval again" onClick={onRerun} disabled={!!busy}>
            {busy === 'rerun' ? <Spinner /> : <Icon name="rerun" className="h-3 w-3" />}
            <span className="max-sm:sr-only">{busy === 'rerun' ? 'Running…' : 'Rerun'}</span>
          </button>
        ) : null}
      </div>
    </header>
  )
}
